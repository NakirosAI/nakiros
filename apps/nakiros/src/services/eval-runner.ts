import { spawn, type ChildProcess, execFile } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

import { gradeLlmAssertionsBatch, JUDGE_MODEL } from './eval-llm-grader.js';
import { writeIterationBenchmark } from './eval-benchmark.js';
import { cleanupEvalArtifacts } from './eval-artifact-cleanup.js';

import type {
  EvalRunConfig,
  EvalRunEvent,
  EvalRunStatus,
  EvalRunTurn,
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
}

const runs = new Map<string, RunEntry>();
let runCounter = 0;

/** Default max number of claude subprocesses running in parallel. */
const DEFAULT_MAX_CONCURRENT = 4;

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${(++runCounter).toString(36)}`;
}

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
    // Mirror the directory structure inside the workdir
    const dest = join(workdir, relPath);
    mkdirSync(join(dest, '..'), { recursive: true });
    try {
      cpSync(src, dest);
    } catch {
      // ignore
    }
  }
}

// ─── Run lifecycle ──────────────────────────────────────────────────────────

interface SpawnArgs {
  prompt: string;
  workdir: string;
  addDirs: string[];
  resumeSessionId?: string;
}

function buildClaudeArgs(args: SpawnArgs): string[] {
  // No --dangerously-skip-permissions: permissions are scoped via settings.local.json in the workdir.
  const cliArgs: string[] = ['--output-format', 'stream-json', '--verbose'];
  for (const d of args.addDirs) {
    cliArgs.push('--add-dir', d);
  }
  if (args.resumeSessionId) {
    cliArgs.push('--resume', args.resumeSessionId);
  }
  cliArgs.push('--print', args.prompt);
  return cliArgs;
}

function persistRunJson(run: SkillEvalRun): void {
  const runJsonPath = join(run.workdir, 'run.json');
  writeFileSync(runJsonPath, JSON.stringify(run, null, 2), 'utf8');
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

  // Collect the last assistant text so LLM judges can reason when agent didn't write files
  const lastAssistantText = run.turns
    .filter((t) => t.role === 'assistant')
    .map((t) => t.content)
    .join('\n\n')
    .slice(-8000); // cap size passed to judge

  // Partition assertions by type, keeping original positions so we can merge back in order
  const scriptIndices: number[] = [];
  const llmIndices: number[] = [];
  const manualIndices: number[] = [];
  for (let i = 0; i < assertionDefs.length; i++) {
    const t = assertionDefs[i].type;
    if (t === 'script') scriptIndices.push(i);
    else if (t === 'llm') llmIndices.push(i);
    else manualIndices.push(i);
  }

  // Grade scripts sequentially (fast), LLM assertions in a single batched judge spawn
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
 * Start a batch of eval runs for a skill. Runs execute sequentially.
 * Returns immediately with the iteration number and the list of runIds created (queued).
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

  // Create all runs in `queued` state first
  const createdRuns: SkillEvalRun[] = [];
  for (const def of selectedDefs) {
    for (const config of configs) {
      const workdir = prepareEvalWorkdir(skillDir, iteration, def.name, config);
      copyFixtures(skillDir, workdir, def.files);

      const run: SkillEvalRun = {
        runId: generateRunId(),
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

      runs.set(run.runId, {
        run,
        child: null,
        onEvent: options.onEvent,
        killed: false,
      });
      persistRunJson(run);
      createdRuns.push(run);
    }
  }

  // Execute with bounded concurrency (max N runs in parallel)
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
          persistRunJson(entry.run);
          options.onEvent({ runId: entry.run.runId, event: { type: 'done', exitCode: 1, error: msg } });
        }
      }
    };

    for (let i = 0; i < Math.min(maxConcurrent, createdRuns.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    // Note: interactive runs that stay in waiting_for_input don't count here —
    // they are finalized (and benchmarked again) when the user clicks Finish or
    // output files appear. For fully-autonomous batches, all runs are terminal now.
    try {
      writeIterationBenchmark(skillDir, request.skillName, iteration);
    } catch (err) {
      console.error('[eval-runner] Failed to write benchmark.json:', err);
    }

    // Sweep up any stray `nakiros-eval-*` skills that might have been created
    // in the user's skill dirs despite our prompt instructions.
    cleanupEvalArtifacts();
  })();

  return {
    iteration,
    runIds: createdRuns.map((r) => r.runId),
  };
}

async function executeRun(entry: RunEntry, definition: SkillEvalDefinition, skillDir: string): Promise<void> {
  const { run, onEvent } = entry;

  // No HOME isolation. For without_skill baselines we deny the Skill tool in the
  // workdir settings (see prepareEvalWorkdir) so Claude cannot invoke any skill
  // even if auto-discovery would otherwise pick one up.

  // For with_skill runs, invoke the skill explicitly on the first turn via the /skill-name pattern.
  // This ensures the skill is actually loaded, not just discoverable.
  const firstTurnPrompt =
    run.config === 'with_skill'
      ? `/${run.skillName} ${definition.prompt}`
      : definition.prompt;

  await executeTurn(entry, skillDir, firstTurnPrompt, /* isFirstTurn */ true);

  if (entry.killed || run.status === 'failed' || run.status === 'stopped') {
    cleanupRunIsolation(run);
    return;
  }

  // Interactive mode: check if the eval is complete, else transition to waiting_for_input
  if (run.mode === 'interactive') {
    if (!allOutputFilesExist(run)) {
      run.status = 'waiting_for_input';
      persistRunJson(run);
      const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
      onEvent({ runId: run.runId, event: { type: 'status', status: 'waiting_for_input' } });
      onEvent({ runId: run.runId, event: { type: 'waiting_for_input', lastAssistantText } });
      return; // Control returns here when the user sends a message or clicks "Finish"
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
  const { run, onEvent } = entry;

  run.status = 'starting';
  persistRunJson(run);
  onEvent({ runId: run.runId, event: { type: 'status', status: 'starting' } });

  const addDirs: string[] = [];
  if (run.config === 'with_skill') addDirs.push(skillDir);

  const cliArgs = buildClaudeArgs({
    prompt: userMessage,
    workdir: run.workdir,
    addDirs,
    resumeSessionId: isFirstTurn ? undefined : (run.sessionId ?? undefined),
  });

  const started = Date.now();
  run.turns.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  });

  let assistantText = '';
  const tools: { name: string; display: string }[] = [];
  let capturedSessionId: string | null = run.sessionId;
  let exitCode = 0;
  let errorMessage: string | null = null;

  await new Promise<void>((resolve) => {
    const child = spawn('claude', cliArgs, {
      cwd: run.workdir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.child = child;

    run.status = 'running';
    persistRunJson(run);
    onEvent({ runId: run.runId, event: { type: 'status', status: 'running' } });

    let buffer = '';
    let stderrBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          handleClaudeEvent(event, {
            onSession: (id) => {
              capturedSessionId = id;
              run.sessionId = id;
            },
            onText: (text) => {
              assistantText += text;
              onEvent({ runId: run.runId, event: { type: 'text', text } });
            },
            onTool: (name, display) => {
              tools.push({ name, display });
              onEvent({ runId: run.runId, event: { type: 'tool', name, display } });
            },
            onUsage: (tokens) => {
              run.tokensUsed += tokens;
              onEvent({ runId: run.runId, event: { type: 'tokens', tokensUsed: run.tokensUsed } });
            },
          });
        } catch {
          // Not a JSON line — ignore
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      exitCode = code ?? 0;
      if (exitCode !== 0 && stderrBuffer.trim()) {
        errorMessage = stderrBuffer.trim().slice(-500);
      }
      resolve();
    });

    child.on('error', (err) => {
      exitCode = 1;
      errorMessage = err.message.includes('ENOENT')
        ? '`claude` CLI not found. Make sure Claude Code is installed and on PATH.'
        : err.message;
      resolve();
    });
  });

  const ended = Date.now();
  run.durationMs += ended - started;
  run.sessionId = capturedSessionId;
  run.turns.push({
    role: 'assistant',
    content: assistantText,
    timestamp: new Date().toISOString(),
    tools,
  });
  entry.child = null;

  if (exitCode !== 0 || errorMessage) {
    run.status = 'failed';
    run.error = errorMessage;
    run.finishedAt = new Date().toISOString();
    cleanupRunIsolation(run);
    persistRunJson(run);
    saveTimingJson(run);
    onEvent({ runId: run.runId, event: { type: 'done', exitCode, error: errorMessage ?? undefined } });
  }
}

function cleanupRunIsolation(_run: SkillEvalRun): void {
  // No-op — we no longer use an isolated HOME.
  // Skill isolation for without_skill runs is done via settings.local.json deny list.
}

function allOutputFilesExist(run: SkillEvalRun): boolean {
  if (run.outputFiles.length === 0) return false;
  for (const file of run.outputFiles) {
    if (!existsSync(join(run.workdir, 'outputs', file))) return false;
  }
  return true;
}

async function finalizeRun(entry: RunEntry, definition: SkillEvalDefinition): Promise<void> {
  const { run, onEvent } = entry;

  run.finishedAt = new Date().toISOString();
  cleanupRunIsolation(run);

  run.status = 'grading';
  persistRunJson(run);
  onEvent({ runId: run.runId, event: { type: 'status', status: 'grading' } });

  await gradeRun(run, definition);

  run.status = 'completed';
  persistRunJson(run);
  saveTimingJson(run);
  onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
  onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });

  // Refresh benchmark.json so the UI picks up this run's results immediately
  try {
    const iterDir = deriveIterDir(run);
    if (iterDir) writeIterationBenchmark(iterDir.skillDir, run.skillName, run.iteration);
  } catch (err) {
    console.error('[eval-runner] Failed to refresh benchmark.json:', err);
  }

  // Sweep stray eval-produced skills (interactive runs that just finalized)
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
 * Send a user message to a run that is waiting_for_input (interactive mode).
 * Resumes the claude session, executes a new turn, then re-evaluates completion.
 */
export async function sendUserMessage(runId: string, message: string, skillDir: string, definition: SkillEvalDefinition): Promise<void> {
  const entry = runs.get(runId);
  if (!entry) throw new Error(`Run not found: ${runId}`);
  const { run } = entry;
  if (run.status !== 'waiting_for_input') {
    throw new Error(`Run ${runId} is not waiting for input (status=${run.status})`);
  }

  await executeTurn(entry, skillDir, message, /* isFirstTurn */ false);

  const currentStatus = run.status as EvalRunStatus;
  if (entry.killed || currentStatus === 'failed' || currentStatus === 'stopped') return;

  if (run.mode === 'interactive' && !allOutputFilesExist(run)) {
    run.status = 'waiting_for_input';
    persistRunJson(run);
    const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
    entry.onEvent({ runId, event: { type: 'status', status: 'waiting_for_input' } });
    entry.onEvent({ runId, event: { type: 'waiting_for_input', lastAssistantText } });
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

// ─── Claude stream event handler ────────────────────────────────────────────

interface ClaudeEventHandlers {
  onSession(id: string): void;
  onText(text: string): void;
  onTool(name: string, display: string): void;
  onUsage(totalTokens: number): void;
}

function handleClaudeEvent(event: Record<string, unknown>, handlers: ClaudeEventHandlers): void {
  const type = event['type'] as string;

  if (type === 'system') {
    const sessionId = event['session_id'] as string | undefined;
    if (sessionId) handlers.onSession(sessionId);
    return;
  }

  if (type === 'assistant') {
    const sessionId = event['session_id'] as string | undefined;
    if (sessionId) handlers.onSession(sessionId);
    const message = event['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(message?.content)) return;
    for (const block of message!.content) {
      const b = block as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
      if (b.type === 'text' && b.text) {
        handlers.onText(b.text);
      } else if (b.type === 'tool_use' && b.name) {
        handlers.onTool(b.name, formatTool(b.name, b.input ?? {}));
      }
    }
    return;
  }

  if (type === 'result') {
    const usage = event['usage'] as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
    if (usage) {
      const total = usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      handlers.onUsage(total);
    }
    const sessionId = event['session_id'] as string | undefined;
    if (sessionId) handlers.onSession(sessionId);
    return;
  }
}

function formatTool(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => (str.length > max ? str.slice(0, max) + '…' : str);
  switch (name) {
    case 'Read': return `Reading ${s(input['file_path'])}`;
    case 'Write': return `Writing ${s(input['file_path'])}`;
    case 'Edit':
    case 'MultiEdit': return `Editing ${s(input['file_path'])}`;
    case 'Bash': return `$ ${truncate(s(input['command']))}`;
    case 'Glob': return `Glob: ${s(input['pattern'])}`;
    case 'Grep': return `Grep: ${s(input['pattern'])}`;
    default: return name;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function listRuns(): SkillEvalRun[] {
  return Array.from(runs.values()).map((e) => e.run);
}

export function getRun(runId: string): SkillEvalRun | null {
  return runs.get(runId)?.run ?? null;
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
    persistRunJson(entry.run);
    entry.onEvent({ runId, event: { type: 'status', status: 'stopped' } });
  }
}

/**
 * Load all runs from a skill's workspace iterations into the in-memory registry.
 * Useful when the app boots to surface previously-run results in the UI.
 * Called once per view render; deduplicates by workdir.
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
