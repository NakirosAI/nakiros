import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  AnalyzeConvoRun,
  AnalyzeConvoRunEvent,
  NormalizedConversation,
  StartAnalyzeConvoRequest,
} from '@nakiros/shared';

import {
  cleanupRunWorkdir,
  createRunner,
  encodeProjectPath,
  isActiveRunStatus,
  type RehydrateResult,
  type RunEntry,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { analyzeConversation } from './conversation-analyzer.js';
import { getConversationMessages } from './conversation-parser.js';
import {
  HAIKU_INPUT_BUDGET,
  HAIKU_MODEL,
  MAX_PROMPT_TOKENS,
  SONNET_MODEL,
  analysisFilePath,
  buildAnalyzeConvoPrompt,
  estimatePromptTokens,
  persistAnalysis,
} from './conversation-deep-analyzer.js';

const KIND = 'analyze-convo';
const REPORT_RELATIVE_PATH = 'outputs/deep-analysis.md';

interface AnalyzeConvoExtras {
  /** Full path to the provider's project dir — used to fetch the JSONL on resume turns. */
  providerProjectDir: string;
  /** Pre-computed prompt at start (cached so resume turns don't re-build it). */
  initialPrompt: string;
  /** Pre-computed model id at start (haiku/sonnet) so all turns share it. */
  modelId: string;
  /** Estimated input tokens — exposed via the run for cost transparency. */
  estimatedInputTokens: number;
  /** Provider of the conversation being analyzed. */
  sourceProvider: NormalizedConversation['provider'];
  /** Agent CLI producing the report. */
  analyzerProvider: NormalizedConversation['provider'];
  sourceFingerprint?: string;
}

/** Internal start request — the public type + the resolved providerProjectDir. */
interface AnalyzeConvoStartReq extends StartAnalyzeConvoRequest {
  providerProjectDir: string;
  conversation?: NormalizedConversation;
}

type AnalyzeConvoEvent = AnalyzeConvoRunEvent['event'];
type AnalyzeConvoEntry = RunEntry<AnalyzeConvoRun, AnalyzeConvoEvent, AnalyzeConvoExtras>;

function runsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'analyze-convo');
}

/**
 * Build the deep-analysis prompt + estimate its token size + pick a model.
 * Throws if the conversation is unreadable or if the prompt exceeds Sonnet's
 * 1M window.
 */
function preparePromptForRun(req: AnalyzeConvoStartReq): {
  prompt: string;
  modelId: string;
  estimatedInputTokens: number;
} {
  const stage1 = req.conversation?.analysis ??
    analyzeConversation(req.providerProjectDir, req.sessionId, req.projectId);
  if (!stage1) {
    throw new Error(`Conversation ${req.sessionId} not found or unreadable.`);
  }

  const messages = req.conversation?.messages ??
    getConversationMessages(req.providerProjectDir, req.sessionId);
  const prompt = buildAnalyzeConvoPrompt(stage1, messages);
  const estimatedInputTokens = estimatePromptTokens(prompt);

  if (estimatedInputTokens > MAX_PROMPT_TOKENS) {
    throw new Error(
      `Conversation too large for deep analysis (~${Math.round(estimatedInputTokens / 1000)}k tokens, max ${Math.round(MAX_PROMPT_TOKENS / 1000)}k).`,
    );
  }

  const analyzerProvider = req.analyzerProvider ?? req.conversation?.provider ?? 'claude';
  const modelId = analyzerProvider === 'claude'
    ? estimatedInputTokens <= HAIKU_INPUT_BUDGET ? HAIKU_MODEL : SONNET_MODEL
    : 'default';
  return { prompt, modelId, estimatedInputTokens };
}

/**
 * Once the agent has produced `outputs/deep-analysis.md`, archive it into
 * `~/.nakiros/analyses/<sessionId>.json` so re-opens hit the existing cache
 * (used by `loadDeepAnalysis`) and the markdown stays intact in the run
 * workdir for in-page display.
 */
function archiveReport(entry: AnalyzeConvoEntry): { ok: true; reportPath: string } | { ok: false; error: string } {
  const reportSrc = join(entry.run.workdir, REPORT_RELATIVE_PATH);
  if (!existsSync(reportSrc)) {
    return { ok: false, error: 'No deep-analysis.md was produced' };
  }
  let report: string;
  try {
    report = readFileSync(reportSrc, 'utf8').trim();
  } catch (err) {
    return { ok: false, error: `Failed to read report: ${(err as Error).message}` };
  }

  const cachePath = analysisFilePath(
    entry.run.sessionId,
    entry.extras.sourceProvider,
    entry.extras.analyzerProvider,
  );
  try {
    persistAnalysis({
      provider: entry.extras.sourceProvider,
      analyzerProvider: entry.extras.analyzerProvider,
      sessionId: entry.run.sessionId,
      model: entry.extras.modelId,
      inputTokens: entry.extras.estimatedInputTokens,
      sourceFingerprint: entry.extras.sourceFingerprint,
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return { ok: false, error: `Failed to persist report cache: ${(err as Error).message}` };
  }

  // Drop a copy at the canonical path on disk so the UI can still load it after
  // the workdir is torn down via `finish`.
  return { ok: true, reportPath: cachePath };
}

const spec: RunnerSpec<AnalyzeConvoRun, AnalyzeConvoStartReq, AnalyzeConvoEvent, AnalyzeConvoExtras> = {
  kind: KIND,
  runsRoot,

  prepareWorkdir(req, runId) {
    const workdir = join(runsRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    mkdirSync(join(workdir, 'outputs'), { recursive: true });
    writeExecutionSettings(workdir);

    const { prompt, modelId, estimatedInputTokens } = preparePromptForRun(req);
    const analyzerProvider = req.analyzerProvider ?? req.conversation?.provider ?? 'claude';

    return {
      workdir,
      extras: {
        providerProjectDir: req.providerProjectDir,
        initialPrompt: prompt,
        modelId,
        estimatedInputTokens,
        sourceProvider: req.conversation?.provider ?? 'claude',
        analyzerProvider,
        sourceFingerprint: req.conversation
          ? `${req.conversation.lastMessageAt}:${req.conversation.messageCount}`
          : undefined,
      },
    };
  },

  buildFirstPrompt(_req, ctx) {
    // Wrap the analysis prompt with a Write-instruction so the agent persists
    // the markdown report at the canonical path inside the run workdir. The
    // agent has Write tool access via `writeExecutionSettings`.
    return `${ctx.extras.initialPrompt}

Write the final Markdown report to ./${REPORT_RELATIVE_PATH} using your file-editing tools. Do not return the report inline. Once written, end your turn.`;
  },

  createInitialRun(req, runId, workdir, extras): AnalyzeConvoRun {
    return {
      runId,
      projectId: req.projectId,
      sessionId: req.sessionId,
      status: 'starting',
      agentSessionId: null,
      workdir,
      model: extras.modelId,
      analyzerProvider: extras.analyzerProvider,
      estimatedInputTokens: extras.estimatedInputTokens,
      reportPath: null,
      turns: [],
      tokensUsed: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
  },

  buildCliArgs(prompt, entry, isFirstTurn) {
    return {
      prompt,
      resumeSessionId: isFirstTurn ? undefined : (entry.run.agentSessionId ?? undefined),
      model: entry.extras.analyzerProvider === 'claude' ? entry.extras.modelId : undefined,
    };
  },

  agentProvider(entry) {
    return entry.extras.analyzerProvider;
  },

  getAgentSessionId(entry) {
    return entry.run.agentSessionId;
  },

  setAgentSessionId(entry, sessionId) {
    entry.run.agentSessionId = sessionId;
  },

  onTurnComplete(entry, helpers) {
    const result = archiveReport(entry);
    if (result.ok) {
      entry.run.reportPath = result.reportPath;
      helpers.complete(entry);
      entry.eventLog.emit({ type: 'done', exitCode: 0, reportPath: result.reportPath });
      return;
    }
    // No report yet — agent is asking a follow-up question. Wait for the user.
    helpers.wait(entry);
  },

  cleanupOnTerminal(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.run.projectId !== req.projectId) continue;
      if (entry.run.sessionId !== req.sessionId) continue;
      const analyzerProvider = req.analyzerProvider ?? req.conversation?.provider ?? 'claude';
      if (entry.extras.analyzerProvider !== analyzerProvider) continue;
      if (isActiveRunStatus(entry.run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<AnalyzeConvoRun, AnalyzeConvoExtras> {
    const blob = persisted as
      | (AnalyzeConvoRun & { _extras?: AnalyzeConvoExtras })
      | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    const extras = blob._extras;
    if (!extras || !extras.providerProjectDir || !extras.initialPrompt || !extras.modelId) {
      return { kind: 'cleanup' };
    }
    extras.sourceProvider ??= 'claude';
    extras.analyzerProvider ??= 'claude';

    if (blob.status === 'stopped' || blob.status === 'failed') return { kind: 'cleanup' };

    const wasActive = blob.status === 'starting' || blob.status === 'running';
    // Defensive: only mark as resumable if the Claude session file actually
    // lives on disk — a stale sessionId without its `.jsonl` would make
    // `--resume` throw "No conversation found with session ID …".
    const agentSessionId = blob.agentSessionId ?? blob.sessionClaudeId ?? null;
    const sessionFile = extras.analyzerProvider === 'claude' && agentSessionId
      ? join(homedir(), '.claude', 'projects', encodeProjectPath(workdir), `${agentSessionId}.jsonl`)
      : null;
    const canResume = !wasActive || (
      Boolean(agentSessionId) && (
        extras.analyzerProvider === 'codex' || (sessionFile !== null && existsSync(sessionFile))
      )
    );
    const restoredStatus: AnalyzeConvoRun['status'] = wasActive
      ? canResume
        ? 'waiting_for_input'
        : 'stopped'
      : blob.status;

    const restoredRun: AnalyzeConvoRun = {
      runId: blob.runId,
      projectId: blob.projectId,
      sessionId: blob.sessionId,
      status: restoredStatus,
      agentSessionId,
      workdir,
      model: blob.model,
      analyzerProvider: blob.analyzerProvider ?? extras.analyzerProvider,
      estimatedInputTokens: blob.estimatedInputTokens,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: restoredStatus === 'stopped' && wasActive
        ? new Date().toISOString()
        : (blob.finishedAt ?? null),
      error: blob.error ?? null,
      interruptedByReboot:
        restoredStatus === 'waiting_for_input' && wasActive
          ? true
          : blob.interruptedByReboot,
    };

    console.log(`[analyze-convo-runner] Restored ${KIND} run ${restoredRun.runId} for session ${restoredRun.sessionId} (status=${restoredStatus})`);
    return { kind: 'rehydrate', run: restoredRun, extras };
  },
};

const runner = createRunner(spec);

// ─── Public API — preserved exports for IPC handlers ────────────────────────

interface RunOpts {
  providerProjectDir: string;
  conversation?: NormalizedConversation;
  onEvent(event: AnalyzeConvoRunEvent): void;
}

/**
 * Boot recovery. Scans `~/.nakiros/runs/analyze-convo/*` and rehydrates any
 * persisted run that's still meaningful (in-flight resumes via --resume,
 * terminal cached for revisit), cleaning up the rest.
 */
export function restoreOrCleanupAnalyzeConvoWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — first IPC call rebinds */
  });
}

/** List all active (non-terminal) analyze-convo runs. */
export function listActiveAnalyzeConvoRuns(): AnalyzeConvoRun[] {
  return runner.listActive();
}

/** List every analyze-convo run currently held in memory — active and terminal. */
export function listAllAnalyzeConvoRuns(): AnalyzeConvoRun[] {
  return runner.listAll();
}

/**
 * Start (or resume) a deep-analysis run for the given conversation. Idempotent
 * on `(projectId, sessionId)` — an active run rebinds its event log to the
 * new caller.
 */
export function startAnalyzeConvo(request: StartAnalyzeConvoRequest, opts: RunOpts): AnalyzeConvoRun {
  return runner.start(
    { ...request, providerProjectDir: opts.providerProjectDir, conversation: opts.conversation },
    { onEvent: opts.onEvent },
  );
}

/**
 * Forward a user message to an analyze-convo run that's `waiting_for_input`
 * (e.g. "focus on the cache-compaction angle"). Re-points the event log,
 * executes one claude turn via `--resume`, then either archives the updated
 * report on success or waits again.
 */
export async function sendAnalyzeConvoUserMessage(
  runId: string,
  message: string,
  opts: RunOpts,
): Promise<void> {
  await runner.sendUserMessage(runId, message, { onEvent: opts.onEvent });
}

/**
 * Cancel an in-flight analyze-convo run. Tear down the workdir + event log;
 * the entry stays in the registry so the UI can still render it as stopped
 * until the user dismisses it.
 */
export function stopAnalyzeConvo(runId: string): void {
  runner.stop(runId);
}

/**
 * User-acknowledged completion. The cache file in `~/.nakiros/analyses/`
 * stays put; the run workdir + event log are deleted and the entry leaves
 * the registry.
 */
export function finishAnalyzeConvo(runId: string): void {
  runner.finish(runId, { onEvent: () => undefined });
}

/** Look up an analyze-convo run by id. Returns `null` when unknown. */
export function getAnalyzeConvoRun(runId: string): AnalyzeConvoRun | null {
  return runner.getRun(runId);
}

/** Replay buffer for the current (in-flight) turn — used on remount. */
export function getAnalyzeConvoBufferedEvents(runId: string): AnalyzeConvoEvent[] {
  return runner.getBufferedEvents(runId);
}

/** Helper for IPC handlers needing the run's own `providerProjectDir`. */
export function getAnalyzeConvoProviderDir(runId: string): string | null {
  const entry = runner.registry().get(runId);
  return entry?.extras.providerProjectDir ?? null;
}

/** Helper to surface size + timestamp of the run workdir for diagnostic UI. */
export function getAnalyzeConvoWorkdirStats(runId: string): { workdir: string; sizeBytes: number } | null {
  const entry = runner.registry().get(runId);
  if (!entry) return null;
  let sizeBytes = 0;
  const reportPath = join(entry.run.workdir, REPORT_RELATIVE_PATH);
  if (existsSync(reportPath)) {
    try {
      sizeBytes = statSync(reportPath).size;
    } catch {
      // ignore
    }
  }
  return { workdir: entry.run.workdir, sizeBytes };
}

/** Copy the canonical cached report into `dest` (used by future export flow). */
export function copyAnalyzeConvoReport(
  sessionId: string,
  dest: string,
  provider: NormalizedConversation['provider'] = 'claude',
  analyzerProvider: NormalizedConversation['provider'] = provider,
): void {
  const src = analysisFilePath(sessionId, provider, analyzerProvider);
  if (!existsSync(src)) throw new Error(`No cached analysis for session ${sessionId}`);
  copyFileSync(src, dest);
}
