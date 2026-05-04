import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  ClassifyConvoRun,
  ClassifyConvoRunEvent,
  ConversationDigest,
  StartClassifyConvoRequest,
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
import { getConversationMessages } from './conversation-parser.js';
import {
  buildConversationDigest,
  estimateDigestTokens,
} from './conversation-ingest/digest-builder.js';
import {
  getDigestPath,
  getProjectDigestsDir,
} from './conversation-ingest/paths.js';
import { ensureProjectIndexed } from './conversation-ingest/runner.js';
import { readSessionBody } from './conversation-ingest/project-store.js';
import { parseClassifierJson } from './conversation-ingest/classifier-parser.js';

const KIND = 'classify-convo';
const DIGEST_OUTPUT_RELATIVE_PATH = 'outputs/digest.json';

/** Same routing thresholds as the deep-analyzer / analyze-convo. */
const HAIKU_MODEL = 'haiku';
const SONNET_MODEL = 'sonnet';
const HAIKU_INPUT_BUDGET = 170_000;
const MAX_PROMPT_TOKENS = 950_000;

interface ClassifyConvoExtras {
  /** Original cwd of the project — used to look up the encoded ingest dir for persistence. */
  projectPath: string;
  /** Full path to the provider's project dir — used to fetch the JSONL on resume turns. */
  providerProjectDir: string;
  /** Pre-computed prompt at start (cached so resume turns don't re-build it). */
  initialPrompt: string;
  /** Pre-computed model id at start (haiku/sonnet) so all turns share it. */
  modelId: string;
  /** Estimated input tokens — exposed via the run for cost transparency. */
  estimatedInputTokens: number;
}

/** Internal start request — the public type + the resolved providerProjectDir + projectPath. */
interface ClassifyConvoStartReq extends StartClassifyConvoRequest {
  providerProjectDir: string;
  projectPath: string;
}

type ClassifyConvoEvent = ClassifyConvoRunEvent['event'];
type ClassifyConvoEntry = RunEntry<ClassifyConvoRun, ClassifyConvoEvent, ClassifyConvoExtras>;

function runsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'classify-convo');
}

/**
 * Build the digest+prompt + estimate tokens + pick a model. Throws on missing
 * conversation or oversized prompt.
 */
function preparePromptForRun(req: ClassifyConvoStartReq): {
  prompt: string;
  modelId: string;
  estimatedInputTokens: number;
} {
  ensureProjectIndexed(req.providerProjectDir);
  const body = readSessionBody(req.projectPath, req.sessionId);
  const messages = body?.messages ?? getConversationMessages(req.providerProjectDir, req.sessionId);
  if (!messages.length) {
    throw new Error(`Conversation ${req.sessionId} not found or has no messages.`);
  }

  const digestText = buildConversationDigest(messages);
  const promptTokens = estimateDigestTokens(digestText);

  if (promptTokens > MAX_PROMPT_TOKENS) {
    throw new Error(
      `Conversation too large to classify (~${Math.round(promptTokens / 1000)}k tokens, max ${Math.round(MAX_PROMPT_TOKENS / 1000)}k).`,
    );
  }

  // V1.1 diagnostic 2026-05-02: force Sonnet to bypass the Haiku Skill-tool
  // sub-context isolation issue (Haiku invokes the Skill tool which spawns a
  // sub-agent that doesn't see the <digest> from the user prompt). Revert to
  // the threshold-based routing once the inline-skill prompt fix lands.
  // See memory: project_nakiros_classify_convo_haiku_skill_isolation_2026_05_02
  const modelId = SONNET_MODEL;
  void HAIKU_INPUT_BUDGET;

  const prompt =
    '<digest>\n' +
    digestText +
    '\n</digest>\n\n' +
    '<instructions>\n' +
    'Classify the conversation above per the `nakiros-conversation-classifier` skill. Emit a single JSON object with keys `session_summary`, `language`, `phases`, `frictions`, `extracted_rules`. Schema details are in the skill\'s `references/output-schema.md`.\n' +
    '</instructions>\n';

  return { prompt, modelId, estimatedInputTokens: promptTokens };
}

/**
 * After a turn, parse `outputs/digest.json` produced by the agent, normalise
 * snake_case → camelCase, and persist as a `ConversationDigest` under
 * `~/.nakiros/ingest/projects/<encoded>/digests/<sessionId>.json`.
 */
function archiveDigest(
  entry: ClassifyConvoEntry,
): { ok: true; digestPath: string } | { ok: false; error: string } {
  const outputPath = join(entry.run.workdir, DIGEST_OUTPUT_RELATIVE_PATH);
  if (!existsSync(outputPath)) {
    return { ok: false, error: 'No digest.json was produced' };
  }
  let raw: string;
  try {
    raw = readFileSync(outputPath, 'utf8').trim();
  } catch (err) {
    return { ok: false, error: `Failed to read digest.json: ${(err as Error).message}` };
  }

  // CRITICAL: persist under the SOURCE conversation sessionId, not the
  // sub-run's Claude Code session id. `entry.run.sessionId` is overwritten
  // by runner-core's `onSession` handler with the spawned sub-agent's id
  // on the first stream event — using it here would write the digest at
  // the wrong path and the conversation drawer would never find it.
  const sourceSessionId = entry.run.sourceSessionId;

  let parsed: ConversationDigest;
  try {
    const parsedJson = parseClassifierJson(raw);
    parsed = {
      sessionId: sourceSessionId,
      projectPath: entry.extras.projectPath,
      transcriptMtime: new Date().toISOString(),
      model: entry.extras.modelId === HAIKU_MODEL ? 'haiku' : 'sonnet',
      inputTokens: entry.extras.estimatedInputTokens,
      outputTokens: estimateDigestTokens(raw),
      generatedAt: new Date().toISOString(),
      language: parsedJson.language,
      sessionSummary: parsedJson.sessionSummary,
      phases: parsedJson.phases,
      frictions: parsedJson.frictions,
      extractedRules: parsedJson.extractedRules,
    };
  } catch (err) {
    return { ok: false, error: `Invalid digest JSON: ${(err as Error).message}` };
  }

  const digestPath = getDigestPath(entry.extras.projectPath, sourceSessionId);
  try {
    // Ensure the per-project digests dir exists.
    getProjectDigestsDir(entry.extras.projectPath);
    writeFileSync(digestPath, JSON.stringify(parsed, null, 2));
  } catch (err) {
    return { ok: false, error: `Failed to persist digest: ${(err as Error).message}` };
  }
  return { ok: true, digestPath };
}

const spec: RunnerSpec<ClassifyConvoRun, ClassifyConvoStartReq, ClassifyConvoEvent, ClassifyConvoExtras> = {
  kind: KIND,
  runsRoot,

  prepareWorkdir(req, runId) {
    const workdir = join(runsRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    mkdirSync(join(workdir, 'outputs'), { recursive: true });
    writeExecutionSettings(workdir);

    const { prompt, modelId, estimatedInputTokens } = preparePromptForRun(req);

    return {
      workdir,
      extras: {
        projectPath: req.projectPath,
        providerProjectDir: req.providerProjectDir,
        initialPrompt: prompt,
        modelId,
        estimatedInputTokens,
      },
    };
  },

  buildFirstPrompt(_req, ctx) {
    return `${ctx.extras.initialPrompt}

Write the JSON object to ./${DIGEST_OUTPUT_RELATIVE_PATH} using your Write tool. Do not return the JSON inline — only write the file. The first character of the file must be \`{\` and the last must be \`}\`. Once written, end your turn.`;
  },

  createInitialRun(req, runId, workdir, extras): ClassifyConvoRun {
    return {
      runId,
      projectId: req.projectId,
      // `sessionId` mirrors the source conv at start, but runner-core's
      // `onSession` handler will overwrite it with the spawned sub-run's
      // Claude Code session id on the first stream event. Use
      // `sourceSessionId` to identify the conversation being classified.
      sessionId: req.sessionId,
      sourceSessionId: req.sessionId,
      status: 'starting',
      sessionClaudeId: null,
      workdir,
      model: extras.modelId,
      estimatedInputTokens: extras.estimatedInputTokens,
      digestPath: null,
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
      resumeSessionId: isFirstTurn ? undefined : (entry.run.sessionClaudeId ?? undefined),
      model: entry.extras.modelId,
    };
  },

  onTurnComplete(entry, helpers) {
    const result = archiveDigest(entry);
    if (result.ok) {
      entry.run.digestPath = result.digestPath;
      helpers.complete(entry);
      entry.eventLog.emit({ type: 'done', exitCode: 0, digestPath: result.digestPath });
      return;
    }
    // No digest yet — agent is asking a follow-up question. Wait for the user.
    helpers.wait(entry);
  },

  cleanupOnTerminal(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.run.projectId !== req.projectId) continue;
      // Compare against `sourceSessionId` — `sessionId` is overwritten with
      // the sub-run's Claude Code session id and would never match `req.sessionId`.
      if (entry.run.sourceSessionId !== req.sessionId) continue;
      if (isActiveRunStatus(entry.run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<ClassifyConvoRun, ClassifyConvoExtras> {
    const blob = persisted as
      | (ClassifyConvoRun & { _extras?: ClassifyConvoExtras })
      | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    const extras = blob._extras;
    if (!extras || !extras.projectPath || !extras.providerProjectDir || !extras.initialPrompt || !extras.modelId) {
      return { kind: 'cleanup' };
    }

    if (blob.status === 'stopped' || blob.status === 'failed') return { kind: 'cleanup' };

    const wasActive = blob.status === 'starting' || blob.status === 'running';
    const sessionFile = blob.sessionClaudeId
      ? join(homedir(), '.claude', 'projects', encodeProjectPath(workdir), `${blob.sessionClaudeId}.jsonl`)
      : null;
    const canResume = !wasActive || (Boolean(blob.sessionClaudeId) && sessionFile !== null && existsSync(sessionFile));
    const restoredStatus: ClassifyConvoRun['status'] = wasActive
      ? canResume
        ? 'waiting_for_input'
        : 'stopped'
      : blob.status;

    const restoredRun: ClassifyConvoRun = {
      runId: blob.runId,
      projectId: blob.projectId,
      sessionId: blob.sessionId,
      // Source sessionId restored from disk. Pre-fix runs (saved before
      // sourceSessionId existed) fall back to `sessionId`, but those runs
      // already carry the wrong (sub-run) id there — they were broken anyway.
      sourceSessionId: blob.sourceSessionId ?? blob.sessionId,
      status: restoredStatus,
      sessionClaudeId: blob.sessionClaudeId ?? null,
      workdir,
      model: blob.model,
      estimatedInputTokens: blob.estimatedInputTokens,
      digestPath: blob.digestPath ?? null,
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

    console.log(`[classify-convo-runner] Restored ${KIND} run ${restoredRun.runId} for session ${restoredRun.sessionId} (status=${restoredStatus})`);
    return { kind: 'rehydrate', run: restoredRun, extras };
  },
};

const runner = createRunner(spec);

// ─── Public API — preserved exports for IPC handlers ────────────────────────

interface RunOpts {
  providerProjectDir: string;
  projectPath: string;
  onEvent(event: ClassifyConvoRunEvent): void;
}

/** Boot recovery. Called once during daemon startup. */
export function restoreOrCleanupClassifyConvoWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — first IPC call rebinds */
  });
}

/** List all active (non-terminal) classify-convo runs. */
export function listActiveClassifyConvoRuns(): ClassifyConvoRun[] {
  return runner.listActive();
}

/** List every classify-convo run currently held in memory — active and terminal. */
export function listAllClassifyConvoRuns(): ClassifyConvoRun[] {
  return runner.listAll();
}

/**
 * Start (or resume) a classify-convo run for the given conversation. Idempotent
 * on `(projectId, sessionId)` — an active run rebinds its event log to the
 * new caller.
 */
export function startClassifyConvo(
  request: StartClassifyConvoRequest,
  opts: RunOpts,
): ClassifyConvoRun {
  return runner.start(
    {
      ...request,
      providerProjectDir: opts.providerProjectDir,
      projectPath: opts.projectPath,
    },
    { onEvent: opts.onEvent },
  );
}

/**
 * Forward a user message to a classify-convo run that's `waiting_for_input`
 * (e.g. when the agent asked a clarification rather than producing the digest).
 */
export async function sendClassifyConvoUserMessage(
  runId: string,
  message: string,
  opts: RunOpts,
): Promise<void> {
  await runner.sendUserMessage(runId, message, { onEvent: opts.onEvent });
}

/** Cancel an in-flight classify-convo run. */
export function stopClassifyConvo(runId: string): void {
  runner.stop(runId);
}

/** User-acknowledged completion. Removes the run workdir + entry from the registry. */
export function finishClassifyConvo(runId: string): void {
  runner.finish(runId, { onEvent: () => undefined });
}

/** Look up a classify-convo run by id. Returns `null` when unknown. */
export function getClassifyConvoRun(runId: string): ClassifyConvoRun | null {
  return runner.getRun(runId);
}

/** Replay buffer for the current (in-flight) turn — used on remount. */
export function getClassifyConvoBufferedEvents(runId: string): ClassifyConvoEvent[] {
  return runner.getBufferedEvents(runId);
}

/** Helper for IPC handlers needing the run's own `providerProjectDir` + `projectPath`. */
export function getClassifyConvoExtras(
  runId: string,
): { providerProjectDir: string; projectPath: string } | null {
  const entry = runner.registry().get(runId);
  if (!entry) return null;
  return {
    providerProjectDir: entry.extras.providerProjectDir,
    projectPath: entry.extras.projectPath,
  };
}

/** Surface size + timestamp of the run workdir for diagnostic UI. */
export function getClassifyConvoWorkdirStats(runId: string): { workdir: string; sizeBytes: number } | null {
  const entry = runner.registry().get(runId);
  if (!entry) return null;
  let sizeBytes = 0;
  const outputPath = join(entry.run.workdir, DIGEST_OUTPUT_RELATIVE_PATH);
  if (existsSync(outputPath)) {
    try {
      sizeBytes = statSync(outputPath).size;
    } catch {
      // ignore
    }
  }
  return { workdir: entry.run.workdir, sizeBytes };
}
