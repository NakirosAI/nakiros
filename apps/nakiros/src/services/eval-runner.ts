import { type ChildProcess, execFile } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

import { gradeLlmAssertionsBatch, JUDGE_MODEL } from './eval-llm-grader.js';
import { writeIterationBenchmark } from './eval-benchmark.js';
import { cleanupEvalArtifacts } from './eval-artifact-cleanup.js';

import {
  EventLog,
  buildClaudeArgs,
  deleteClaudeProjectEntry,
  generateRunId,
  persistRunJson,
  spawnClaudeTurn,
} from './runner-core/index.js';

import type {
  EvalRunConfig,
  EvalRunEvent,
  EvalRunStatus,
  SkillEvalAssertionDefinition,
  SkillEvalDefinition,
  SkillEvalRun,
  StartEvalRunRequest,
  StartEvalRunResponse,
} from '@nakiros/shared';

const execFileAsync = promisify(execFile);

// ─── Run registry (in-memory) ───────────────────────────────────────────────

interface RunEntry {
  run: SkillEvalRun;
  child: ChildProcess | null;
  onEvent: (event: EvalRunEvent) => void;
  killed: boolean;
  eventLog: EventLog<EvalRunEvent['event']>;
}

const runs = new Map<string, RunEntry>();

/** Default max number of claude subprocesses running in parallel. */
const DEFAULT_MAX_CONCURRENT = 4;

// ─── Iteration helpers ──────────────────────────────────────────────────────

function getSkillDir(request: StartEvalRunRequest, resolveSkillDir: (req: StartEvalRunRequest) => string): string {
  return resolveSkillDir(request);
}

function computeNextIteration(skillDir: string): number {
  const workspaceDir = join(skillDir, 'evals', 'workspace');
  if (!existsSync(workspaceDir)) return 1;
  try {
    const dirs = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
      .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    return dirs.length > 0 ? Math.max(...dirs) + 1 : 1;
  } catch {
    return 1;
  }
}

function prepareEvalWorkdir(
  skillDir: string,
  iteration: number,
  evalName: string,
  config: EvalRunConfig,
): string {
  const workdir = join(skillDir, 'evals', 'workspace', `iteration-${iteration}`, `eval-${evalName}`, config);
  mkdirSync(join(workdir, 'outputs'), { recursive: true });

  // Create `.claude/settings.local.json` to auto-accept edits and scope tool permissions.
  // For without_skill runs: deny the Skill tool so Claude cannot load any skill
  // (even if auto-discovery would match one from ~/.claude/skills/).
  const claudeDir = join(workdir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.local.json');
  if (!existsSync(settingsPath)) {
    const settings: {
      permissions: {
        defaultMode: string;
        allow: string[];
        deny?: string[];
      };
    } = {
      permissions: {
        defaultMode: 'acceptEdits',
        allow: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      },
    };
    if (config === 'without_skill') {
      settings.permissions.deny = ['Skill'];
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  return workdir;
}

function copyFixtures(skillDir: string, workdir: string, fixtureRelPaths: string[]): void {
  for (const relPath of fixtureRelPaths) {
    const src = join(skillDir, relPath);
    if (!existsSync(src)) continue;
    const dest = join(workdir, relPath);
    mkdirSync(join(dest, '..'), { recursive: true });
    try {
      cpSync(src, dest);
    } catch {
      // ignore
    }
  }
}

function writeRunJson(run: SkillEvalRun): void {
  persistRunJson(run.workdir, run);
}

function saveTimingJson(run: SkillEvalRun): void {
  const timingPath = join(run.workdir, 'timing.json');
  const payload = {
    total_tokens: run.tokensUsed,
    duration_ms: run.durationMs,
  };
  writeFileSync(timingPath, JSON.stringify(payload, null, 2), 'utf8');
}

// ─── Script grading ─────────────────────────────────────────────────────────

interface AssertionResult {
  type: 'script' | 'llm' | 'manual';
  text: string;
  passed: boolean;
  evidence: string;
}

async function gradeScriptAssertion(
  workdir: string,
  assertion: SkillEvalAssertionDefinition,
): Promise<AssertionResult> {
  if (!assertion.script) {
    return { type: 'script', text: assertion.text, passed: false, evidence: 'Missing script command' };
  }
  try {
    const { stdout } = await execFileAsync('sh', ['-c', assertion.script], { cwd: workdir });
    return {
      type: 'script',
      text: assertion.text,
      passed: true,
      evidence: stdout.trim().slice(0, 400) || 'Exit code 0',
    };
  } catch (err) {
    const error = err as { code?: number; stderr?: string; stdout?: string };
    return {
      type: 'script',
      text: assertion.text,
      passed: false,
      evidence: `Exit code ${error.code ?? 1}: ${(error.stderr ?? '').trim().slice(0, 300)}`,
    };
  }
}

async function gradeRun(run: SkillEvalRun, definition: SkillEvalDefinition): Promise<void> {
  const assertionDefs = normalizeAssertions(definition.assertions);

  const lastAssistantText = run.turns
    .filter((t) => t.role === 'assistant')
    .map((t) => t.content)
    .join('\n\n')
    .slice(-8000);

  const scriptIndices: number[] = [];
  const llmIndices: number[] = [];
  const manualIndices: number[] = [];
  for (let i = 0; i < assertionDefs.length; i++) {
    const t = assertionDefs[i].type;
    if (t === 'script') scriptIndices.push(i);
    else if (t === 'llm') llmIndices.push(i);
    else manualIndices.push(i);
  }

  const results: AssertionResult[] = new Array(assertionDefs.length);

  for (const i of scriptIndices) {
    results[i] = await gradeScriptAssertion(run.workdir, assertionDefs[i]);
  }

  if (llmIndices.length > 0) {
    const llmAssertions = llmIndices.map((i) => assertionDefs[i]);
    const llmResults = await gradeLlmAssertionsBatch(run.workdir, llmAssertions, lastAssistantText);
    for (let j = 0; j < llmIndices.length; j++) {
      const i = llmIndices[j];
      results[i] = {
        type: 'llm',
        text: assertionDefs[i].text,
        passed: llmResults[j].passed,
        evidence: llmResults[j].evidence,
      };
    }
  }

  for (const i of manualIndices) {
    results[i] = {
      type: assertionDefs[i].type,
      text: assertionDefs[i].text,
      passed: false,
      evidence: 'Manual review required',
    };
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const total = results.length;
  const passRate = total > 0 ? passed / total : 0;

  const hasLlm = results.some((r) => r.type === 'llm');
  const hasScript = results.some((r) => r.type === 'script');
  const judgeLabel = `claude-judge (${JUDGE_MODEL})`;
  const graderModel = hasLlm && hasScript ? `script + ${judgeLabel}` : hasLlm ? judgeLabel : 'script';

  const grading = {
    eval_id: String(definition.id),
    eval_name: definition.name,
    skill_name: run.skillName,
    iteration: String(run.iteration),
    config: run.config,
    timestamp: new Date().toISOString(),
    grader_model: graderModel,
    assertion_results: results.map((r) => ({
      type: r.type,
      text: r.text,
      passed: r.passed,
      evidence: r.evidence,
    })),
    summary: { passed, failed, total, pass_rate: passRate },
  };

  const gradingPath = join(run.workdir, 'grading.json');
  writeFileSync(gradingPath, JSON.stringify(grading, null, 2), 'utf8');
}

function normalizeAssertions(
  assertions: SkillEvalDefinition['assertions'],
): SkillEvalAssertionDefinition[] {
  return assertions.map((a) => {
    if (typeof a === 'string') {
      return { type: 'llm', text: a };
    }
    return a;
  });
}

// ─── Main runner ────────────────────────────────────────────────────────────

export interface StartRunsOptions {
  resolveSkillDir(request: StartEvalRunRequest): string;
  onEvent(event: EvalRunEvent): void;
}

/**
 * Start a batch of eval runs for a skill. Runs execute with bounded concurrency.
 * Returns immediately with the iteration number and the list of runIds created.
 */
export async function startEvalRuns(
  request: StartEvalRunRequest,
  options: StartRunsOptions,
): Promise<StartEvalRunResponse> {
  const skillDir = getSkillDir(request, options.resolveSkillDir);
  if (!existsSync(skillDir)) {
    throw new Error(`Skill directory not found: ${skillDir}`);
  }

  const evalsJsonPath = join(skillDir, 'evals', 'evals.json');
  if (!existsSync(evalsJsonPath)) {
    throw new Error(`No evals.json for skill at ${skillDir}`);
  }

  const evalsFile = JSON.parse(readFileSync(evalsJsonPath, 'utf8')) as {
    skill_name?: string;
    evals: Array<{
      id: number;
      name: string;
      prompt: string;
      expected_output?: string;
      mode?: 'autonomous' | 'interactive';
      files?: string[];
      output_files?: string[];
      assertions: SkillEvalAssertionDefinition[] | string[];
    }>;
  };

  type LocalDef = SkillEvalDefinition & { files: string[]; outputFiles: string[] };
  const filterNames = new Set(request.evalNames ?? []);
  const selectedDefs: LocalDef[] = evalsFile.evals
    .filter((e) => filterNames.size === 0 || filterNames.has(e.name))
    .map((e) => ({
      id: e.id,
      name: e.name,
      prompt: e.prompt,
      expectedOutput: e.expected_output ?? '',
      mode: e.mode ?? 'autonomous',
      assertions: e.assertions,
      files: e.files ?? [],
      outputFiles: e.output_files ?? [],
    }));

  if (selectedDefs.length === 0) {
    throw new Error('No matching evals to run');
  }

  const iteration = computeNextIteration(skillDir);
  const includeBaseline = request.includeBaseline === true;
  const configs: EvalRunConfig[] = includeBaseline ? ['with_skill', 'without_skill'] : ['with_skill'];

  const createdRuns: SkillEvalRun[] = [];
  for (const def of selectedDefs) {
    for (const config of configs) {
      const workdir = prepareEvalWorkdir(skillDir, iteration, def.name, config);
      copyFixtures(skillDir, workdir, def.files);

      const runId = generateRunId('run');
      const run: SkillEvalRun = {
        runId,
        skillName: request.skillName,
        evalName: def.name,
        iteration,
        config,
        status: 'queued',
        sessionId: null,
        scope: request.scope,
        workdir,
        prompt: def.prompt,
        mode: def.mode ?? 'autonomous',
        outputFiles: def.outputFiles,
        isolatedHome: null,
        turns: [],
        tokensUsed: 0,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
      };

      const eventLog = new EventLog<EvalRunEvent['event']>({
        workdir,
        broadcast: (event) => options.onEvent({ runId, event }),
      });

      runs.set(run.runId, {
        run,
        child: null,
        onEvent: options.onEvent,
        killed: false,
        eventLog,
      });
      writeRunJson(run);
      createdRuns.push(run);
    }
  }

  const maxConcurrent = request.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

  void (async () => {
    const queue = [...createdRuns];
    const workers: Promise<void>[] = [];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const run = queue.shift();
        if (!run) break;
        const entry = runs.get(run.runId);
        if (!entry || entry.killed) continue;
        try {
          await executeRun(entry, selectedDefs.find((d) => d.name === run.evalName)!, skillDir);
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          entry.run.status = 'failed';
          entry.run.error = msg;
          entry.run.finishedAt = new Date().toISOString();
          writeRunJson(entry.run);
          entry.eventLog.emit({ type: 'done', exitCode: 1, error: msg });
          entry.eventLog.destroy();
        }
      }
    };

    for (let i = 0; i < Math.min(maxConcurrent, createdRuns.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    try {
      writeIterationBenchmark(skillDir, request.skillName, iteration);
    } catch (err) {
      console.error('[eval-runner] Failed to write benchmark.json:', err);
    }

    cleanupEvalArtifacts();
  })();

  return {
    iteration,
    runIds: createdRuns.map((r) => r.runId),
  };
}

async function executeRun(entry: RunEntry, definition: SkillEvalDefinition, skillDir: string): Promise<void> {
  const { run } = entry;

  // For with_skill runs, invoke the skill explicitly on the first turn via the /skill-name pattern.
  const firstTurnPrompt =
    run.config === 'with_skill'
      ? `/${run.skillName} ${definition.prompt}`
      : definition.prompt;

  await executeTurn(entry, skillDir, firstTurnPrompt, /* isFirstTurn */ true);

  if (entry.killed || run.status === 'failed' || run.status === 'stopped') {
    return;
  }

  // Interactive mode: check if the eval is complete, else transition to waiting_for_input
  if (run.mode === 'interactive') {
    if (!allOutputFilesExist(run)) {
      run.status = 'waiting_for_input';
      writeRunJson(run);
      const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
      entry.eventLog.emit({ type: 'status', status: 'waiting_for_input' });
      entry.eventLog.emit({ type: 'waiting_for_input', lastAssistantText });
      return;
    }
  }

  await finalizeRun(entry, definition);
}

/**
 * Execute a single claude turn. Caller is responsible for interactive-mode transitions.
 */
async function executeTurn(
  entry: RunEntry,
  skillDir: string,
  userMessage: string,
  isFirstTurn: boolean,
): Promise<void> {
  const { run } = entry;

  entry.eventLog.resetForNewTurn();
  run.status = 'starting';
  writeRunJson(run);
  entry.eventLog.emit({ type: 'status', status: 'starting' });

  const addDirs: string[] = [];
  if (run.config === 'with_skill') addDirs.push(skillDir);

  const cliArgs = buildClaudeArgs({
    prompt: userMessage,
    addDirs,
    resumeSessionId: isFirstTurn ? undefined : (run.sessionId ?? undefined),
    // No skipPermissions: eval runs rely on workdir-scoped settings.local.json
    // so baseline (without_skill) runs can't load any skill.
  });

  const started = Date.now();
  run.turns.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  });

  let assistantText = '';
  const tools: { name: string; display: string }[] = [];

  run.status = 'running';
  writeRunJson(run);
  entry.eventLog.emit({ type: 'status', status: 'running' });

  const result = await spawnClaudeTurn({
    workdir: run.workdir,
    cliArgs,
    onChildSpawned: (c) => { entry.child = c; },
    isKilled: () => entry.killed,
    onSession: (id) => { run.sessionId = id; },
    onText: (text) => {
      assistantText += text;
      entry.eventLog.emit({ type: 'text', text });
    },
    onTool: (name, display) => {
      tools.push({ name, display });
      entry.eventLog.emit({ type: 'tool', name, display });
    },
    onUsage: (tokens) => {
      run.tokensUsed += tokens;
      entry.eventLog.emit({ type: 'tokens', tokensUsed: run.tokensUsed });
    },
  });

  run.durationMs += Date.now() - started;
  run.turns.push({
    role: 'assistant',
    content: assistantText,
    timestamp: new Date().toISOString(),
    tools,
  });
  entry.child = null;

  if (result.exitCode !== 0 || result.error) {
    run.status = 'failed';
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    writeRunJson(run);
    saveTimingJson(run);
    entry.eventLog.emit({ type: 'done', exitCode: result.exitCode, error: result.error ?? undefined });
    entry.eventLog.destroy();
    // Iteration workdir stays (grading artefacts), but the Claude project
    // entry is redundant once the run has failed — drop it.
    deleteClaudeProjectEntry(run.workdir);
  }
}

function allOutputFilesExist(run: SkillEvalRun): boolean {
  if (run.outputFiles.length === 0) return false;
  for (const file of run.outputFiles) {
    if (!existsSync(join(run.workdir, 'outputs', file))) return false;
  }
  return true;
}

async function finalizeRun(entry: RunEntry, definition: SkillEvalDefinition): Promise<void> {
  const { run } = entry;

  run.finishedAt = new Date().toISOString();

  run.status = 'grading';
  writeRunJson(run);
  entry.eventLog.emit({ type: 'status', status: 'grading' });

  await gradeRun(run, definition);

  run.status = 'completed';
  writeRunJson(run);
  saveTimingJson(run);
  entry.eventLog.emit({ type: 'status', status: 'completed' });
  entry.eventLog.emit({ type: 'done', exitCode: 0 });

  // Conversation + events are superseded by grading.json; drop the replay log.
  entry.eventLog.destroy();
  // Claude-side project entry is redundant now that run.turns[] + grading.json
  // capture everything meaningful. Keep the workdir (iteration artefact).
  deleteClaudeProjectEntry(run.workdir);

  try {
    const iterDir = deriveIterDir(run);
    if (iterDir) writeIterationBenchmark(iterDir.skillDir, run.skillName, run.iteration);
  } catch (err) {
    console.error('[eval-runner] Failed to refresh benchmark.json:', err);
  }

  cleanupEvalArtifacts();
}

function deriveIterDir(run: SkillEvalRun): { skillDir: string; iterDir: string } | null {
  const marker = '/evals/workspace/';
  const idx = run.workdir.indexOf(marker);
  if (idx === -1) return null;
  const skillDir = run.workdir.slice(0, idx);
  const iterDir = join(skillDir, 'evals', 'workspace', `iteration-${run.iteration}`);
  return { skillDir, iterDir };
}

/**
 * Re-point the entry's event log broadcast to the current caller's onEvent.
 * Preserves the in-memory replay buffer.
 */
function rebindEventLog(entry: RunEntry, onEvent: (event: EvalRunEvent) => void): void {
  const buffered = entry.eventLog.getBuffered();
  entry.eventLog = new EventLog<EvalRunEvent['event']>({
    workdir: entry.run.workdir,
    broadcast: (event) => onEvent({ runId: entry.run.runId, event }),
  });
  for (const ev of buffered) {
    (entry.eventLog as unknown as { buffer: unknown[] }).buffer.push(ev);
  }
  entry.onEvent = onEvent;
}

/**
 * Send a user message to a run that is waiting_for_input (interactive mode).
 */
export async function sendUserMessage(
  runId: string,
  message: string,
  skillDir: string,
  definition: SkillEvalDefinition,
  onEvent: (event: EvalRunEvent) => void,
): Promise<void> {
  const entry = runs.get(runId);
  if (!entry) throw new Error(`Run not found: ${runId}`);
  const { run } = entry;
  if (run.status !== 'waiting_for_input') {
    throw new Error(`Run ${runId} is not waiting for input (status=${run.status})`);
  }

  rebindEventLog(entry, onEvent);
  await executeTurn(entry, skillDir, message, /* isFirstTurn */ false);

  const currentStatus = run.status as EvalRunStatus;
  if (entry.killed || currentStatus === 'failed' || currentStatus === 'stopped') return;

  if (run.mode === 'interactive' && !allOutputFilesExist(run)) {
    run.status = 'waiting_for_input';
    writeRunJson(run);
    const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
    entry.eventLog.emit({ type: 'status', status: 'waiting_for_input' });
    entry.eventLog.emit({ type: 'waiting_for_input', lastAssistantText });
    return;
  }

  await finalizeRun(entry, definition);
}

/**
 * Manually finish a run that is waiting_for_input.
 * Used when the eval tests "the agent should NOT do X" — operator clicks Finish once confirmed.
 */
export async function finishWaitingRun(runId: string, definition: SkillEvalDefinition): Promise<void> {
  const entry = runs.get(runId);
  if (!entry) throw new Error(`Run not found: ${runId}`);
  if (entry.run.status !== 'waiting_for_input') return;
  await finalizeRun(entry, definition);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function listRuns(): SkillEvalRun[] {
  return Array.from(runs.values()).map((e) => e.run);
}

export function getRun(runId: string): SkillEvalRun | null {
  return runs.get(runId)?.run ?? null;
}

/**
 * Return the buffered stream events for the current (in-flight) turn of an eval run.
 */
export function getEvalBufferedEvents(runId: string): EvalRunEvent['event'][] {
  return runs.get(runId)?.eventLog.getBuffered() ?? [];
}

export function stopRun(runId: string): void {
  const entry = runs.get(runId);
  if (!entry) return;
  entry.killed = true;
  if (entry.child) {
    entry.child.kill('SIGTERM');
  }
  if (entry.run.status === 'running' || entry.run.status === 'starting' || entry.run.status === 'queued') {
    entry.run.status = 'stopped';
    entry.run.finishedAt = new Date().toISOString();
    writeRunJson(entry.run);
    entry.eventLog.emit({ type: 'status', status: 'stopped' });
    entry.eventLog.destroy();
    deleteClaudeProjectEntry(entry.run.workdir);
  }
}

/**
 * Load all runs from a skill's workspace iterations into the in-memory registry.
 */
export function loadPersistedRuns(skillDir: string): SkillEvalRun[] {
  const workspaceDir = join(skillDir, 'evals', 'workspace');
  if (!existsSync(workspaceDir)) return [];
  const result: SkillEvalRun[] = [];

  try {
    const iterDirs = readdirSync(workspaceDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('iteration-'));
    for (const iterDir of iterDirs) {
      const iterPath = join(workspaceDir, iterDir.name);
      const evalDirs = readdirSync(iterPath, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('eval-'));
      for (const evalDir of evalDirs) {
        for (const config of ['with_skill', 'without_skill'] as const) {
          const runJsonPath = join(iterPath, evalDir.name, config, 'run.json');
          if (!existsSync(runJsonPath)) continue;
          try {
            const run = JSON.parse(readFileSync(runJsonPath, 'utf8')) as SkillEvalRun;
            result.push(run);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}
