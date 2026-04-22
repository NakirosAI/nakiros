import { type ChildProcess, execFile } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { promisify } from 'util';

import { gradeLlmAssertionsBatch, JUDGE_MODEL } from './eval-llm-grader.js';
import { writeIterationBenchmark } from './eval-benchmark.js';
import { cleanupEvalArtifacts } from './eval-artifact-cleanup.js';

import {
  EventLog,
  buildClaudeArgs,
  captureSandboxDiff,
  createEvalSandbox,
  createTmpSandbox,
  deleteClaudeProjectEntry,
  destroyEvalSandbox,
  destroyTmpSandbox,
  findGitRoot,
  generateRunId,
  listSandboxUntracked,
  persistRunJson,
  spawnClaudeTurn,
  writeExecutionSettings,
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
  /**
   * Isolated execution directory used so the agent never touches the real
   * project/skill. Two kinds:
   *  - `'git-worktree'`: a detached worktree of the skill's enclosing git repo
   *    (the ideal case — `diff.patch` is meaningful, `node_modules` resolves via
   *    parent lookup if the worktree lives inside the repo).
   *  - `'tmp'`: a fresh throwaway directory holding a copy of the skill under
   *    `.claude/skills/<name>/`. Used for skills that don't live in a git repo
   *    (bundled / global / any `~/.nakiros/skills/` skill).
   */
  sandbox:
    | { kind: 'git-worktree'; path: string; gitRoot: string }
    | { kind: 'tmp'; path: string }
    | null;
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

/**
 * Prepare the artefact directory — where grading, timing, run.json, the copied
 * outputs, diff.patch and events.jsonl are persisted. Always lives inside the
 * skill's workspace so users can compare iterations over time.
 */
function prepareArtifactDir(
  skillDir: string,
  iteration: number,
  evalName: string,
  config: EvalRunConfig,
): string {
  const dir = join(skillDir, 'evals', 'workspace', `iteration-${iteration}`, `eval-${evalName}`, config);
  mkdirSync(join(dir, 'outputs'), { recursive: true });
  return dir;
}

/**
 * Same as `prepareArtifactDir` but rooted at an absolute path. Used by the
 * comparison runner to write under `evals/comparisons/<ts>/<model>/` instead of
 * the default `evals/workspace/iteration-N/` layout.
 */
function prepareArtifactDirAt(
  rootDir: string,
  evalName: string,
  config: EvalRunConfig,
): string {
  const dir = join(rootDir, `eval-${evalName}`, config);
  mkdirSync(join(dir, 'outputs'), { recursive: true });
  return dir;
}

function writeEvalExecutionSettings(dir: string, config: EvalRunConfig): void {
  writeExecutionSettings(dir, {
    denySkill: config === 'without_skill',
    skipIfExists: true,
  });
}

/**
 * Strip every `evals/workspace/` directory inside the sandbox. These contain
 * the outputs, turns, and grading of previous iterations committed to the
 * repo. Leaving them in place contaminates new runs: a baseline agent
 * (without_skill) that stumbles on `evals/workspace/iteration-1/eval-X/with_skill/outputs/audit-report.md`
 * will mimic the filename/structure, defeating the whole point of the baseline.
 *
 * We remove workspaces for ALL skills in the sandbox, not just the one under
 * test, because a skill being evaluated may look sideways at sibling skills'
 * past runs too.
 */
function stripEvalWorkspaces(sandboxPath: string): void {
  const walk = (dir: string): void => {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      // Skip node_modules, .git, and anything hidden at the root to keep the
      // walk fast. Worktrees don't have node_modules (not tracked) but any
      // fixtures/vendored trees might.
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.name === 'workspace' && dir.endsWith(`${sep}evals`)) {
        try {
          rmSync(full, { recursive: true, force: true });
        } catch (err) {
          console.warn(
            `[eval-runner] Failed to strip eval workspace at ${full}: ${(err as Error).message}`,
          );
        }
        continue;
      }
      walk(full);
    }
  };
  walk(sandboxPath);
}

/**
 * For `without_skill` baselines we must make sure the agent cannot see the
 * skill under test — not even as a readable SKILL.md file. `deny: ['Skill']`
 * in settings.local.json only blocks the Skill tool invocation; it does not
 * prevent Claude from reading SKILL.md via the Read tool or from auto-loading
 * CLAUDE.md-style context from the skill directory. The only reliable way to
 * hide the skill is to physically remove its directory from the sandbox.
 *
 * We compute the skill's location relative to the git root, then delete that
 * subtree inside the sandbox. No-op when the skill is not under the git root
 * (e.g. bundled/global skills — those skip sandboxing altogether).
 */
function removeSkillFromSandbox(sandboxPath: string, skillDir: string, gitRoot: string): void {
  const rel = relative(gitRoot, skillDir);
  // If skillDir is outside the git root, `rel` starts with '..' — in that case
  // the skill wasn't in the worktree to begin with, nothing to do.
  if (rel.startsWith('..') || rel === '') return;
  const targetInSandbox = join(sandboxPath, rel);
  if (!existsSync(targetInSandbox)) return;
  try {
    rmSync(targetInSandbox, { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `[eval-runner] Failed to remove skill from baseline sandbox (${targetInSandbox}): ${(err as Error).message}`,
    );
  }
}

function copyFixtures(skillDir: string, targetDir: string, fixtureRelPaths: string[]): void {
  for (const relPath of fixtureRelPaths) {
    const src = join(skillDir, relPath);
    if (!existsSync(src)) continue;
    const dest = join(targetDir, relPath);
    mkdirSync(join(dest, '..'), { recursive: true });
    try {
      cpSync(src, dest);
    } catch {
      // ignore
    }
  }
}

/**
 * After a turn finishes, copy every file the agent produced under
 * `executionDir/outputs/` into `artifactDir/outputs/` so the grader + UI still
 * find them at the canonical artefact location.
 * No-op when executionDir === artifactDir (fallback mode — outputs are already
 * in the artefact directory).
 */
function syncOutputsToArtifact(executionDir: string, artifactDir: string): void {
  if (executionDir === artifactDir) return;
  const src = join(executionDir, 'outputs');
  if (!existsSync(src)) return;
  const dest = join(artifactDir, 'outputs');
  mkdirSync(dest, { recursive: true });
  try {
    cpSync(src, dest, { recursive: true });
  } catch {
    // best-effort
  }
}

/**
 * Save `git diff HEAD` of the sandbox + the list of untracked paths as a
 * readable patch file inside the artefact directory. This is the artefact of
 * "what this skill would have done to the project".
 */
function saveSandboxDiff(sandboxPath: string, artifactDir: string): void {
  const diff = captureSandboxDiff(sandboxPath);
  const untracked = listSandboxUntracked(sandboxPath);
  let body = diff;
  if (untracked.length > 0) {
    const list = untracked.map((p) => `  ${p}`).join('\n');
    body =
      `# Untracked files created by the agent (not in HEAD):\n${list}\n\n` +
      `# Diff of tracked files modified by the agent:\n${diff || '(no tracked changes)'}\n`;
  }
  try {
    writeFileSync(join(artifactDir, 'diff.patch'), body, 'utf8');
  } catch {
    // best-effort
  }
}

function writeRunJson(run: SkillEvalRun): void {
  persistRunJson(run.workdir, run);
}

function saveTimingJson(run: SkillEvalRun): void {
  const timingPath = join(run.workdir, 'timing.json');
  const payload: Record<string, unknown> = {
    total_tokens: run.tokensUsed,
    duration_ms: run.durationMs,
  };
  if (run.model) payload['model'] = run.model;
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

async function gradeRun(
  run: SkillEvalRun,
  definition: SkillEvalDefinition,
  scriptCwd: string,
): Promise<void> {
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
    // Scripts assert on the state the agent produced — in sandbox mode that's
    // the worktree (modified tracked files + untracked); in fallback mode it's
    // the artefact dir itself. `scriptCwd` is the right dir in either case.
    results[i] = await gradeScriptAssertion(scriptCwd, assertionDefs[i]);
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
  /**
   * Internal-only override used by the comparison runner so runs write into
   * `evals/comparisons/<timestamp>/<model>/` instead of `evals/workspace/iteration-N/`.
   * Absolute path. Layout under the root mirrors an iteration dir
   * (`eval-<name>/<config>/`). When set, `skipBenchmarkWrite` and `fixedIteration`
   * are expected to be set too.
   */
  artifactRootOverride?: string;
  /**
   * Skip the automatic `writeIterationBenchmark` call at the end of the batch.
   * Used by the comparison runner, which writes its own `comparison.json`.
   */
  skipBenchmarkWrite?: boolean;
  /**
   * Override `computeNextIteration`. Comparison runs pass a stable synthetic
   * value so the persisted `SkillEvalRun` records are self-describing.
   */
  fixedIteration?: number;
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

  const iteration = options.fixedIteration ?? computeNextIteration(skillDir);
  const includeBaseline = request.includeBaseline === true;
  const configs: EvalRunConfig[] = includeBaseline ? ['with_skill', 'without_skill'] : ['with_skill'];

  // Detect the skill's enclosing git repo once — all runs in this batch share
  // the same source. `null` when the skill lives outside a git repo (bundled,
  // global, or non-git project): runs fall back to the legacy in-place mode.
  const gitRoot = findGitRoot(skillDir);

  const createdRuns: SkillEvalRun[] = [];
  for (const def of selectedDefs) {
    for (const config of configs) {
      const artifactDir = options.artifactRootOverride
        ? prepareArtifactDirAt(options.artifactRootOverride, def.name, config)
        : prepareArtifactDir(skillDir, iteration, def.name, config);

      const runId = generateRunId('run');

      // Isolation strategy:
      //  - If the skill lives inside a git repo → detached worktree (cheap, COW-like,
      //    preserves the full project context).
      //  - Otherwise → throwaway tmp dir with a COPY of the skill under
      //    `.claude/skills/<name>/` (sans past iterations' workspace/). This is
      //    the only way to keep the agent from reading/writing the real skill
      //    when no git repo encloses it.
      let sandbox: RunEntry['sandbox'] = null;
      if (gitRoot) {
        try {
          const created = createEvalSandbox(gitRoot, `eval-${runId}`);
          sandbox = { kind: 'git-worktree', path: created.path, gitRoot: created.gitRoot };
        } catch (err) {
          console.warn(
            `[eval-runner] Could not create git sandbox for ${runId}: ${(err as Error).message}`,
          );
        }
      }
      if (!sandbox) {
        try {
          const created = createTmpSandbox({
            runId,
            skillDir,
            skillName: request.skillName,
            includeSkill: config === 'with_skill',
          });
          sandbox = { kind: 'tmp', path: created.path };
        } catch (err) {
          // Last-resort fallback: if we can't even create a tmp dir (disk full?),
          // refuse to run rather than silently leak into the real skill.
          throw new Error(
            `[eval-runner] Could not create tmp sandbox for ${runId}: ${(err as Error).message}`,
          );
        }
      }

      const executionDir = sandbox.path;

      // Cross-run isolation for worktrees: strip committed eval artefacts from
      // previous iterations so the agent can't see past runs' outputs. Applies
      // to both configs. (Tmp sandboxes already exclude workspace/ at copy time.)
      if (sandbox.kind === 'git-worktree') {
        stripEvalWorkspaces(sandbox.path);
      }

      // Baseline isolation for worktrees: physically strip the skill from the
      // sandbox so it can't leak via CLAUDE.md auto-discovery or Read. (Tmp
      // sandboxes already omit the skill entirely when `includeSkill: false`.)
      if (sandbox.kind === 'git-worktree' && config === 'without_skill') {
        removeSkillFromSandbox(sandbox.path, skillDir, sandbox.gitRoot);
      }

      // Fixtures + permission settings go where the agent will actually run.
      copyFixtures(skillDir, executionDir, def.files);
      writeEvalExecutionSettings(executionDir, config);
      // outputs/ in the execution dir — the agent writes here, we copy back
      // to artefactDir on finalise so the grader + UI still find it.
      mkdirSync(join(executionDir, 'outputs'), { recursive: true });

      // NOTE: Isolated HOME was removed — it broke claude CLI auth ("Not logged in")
      // despite mirroring ~/.claude/ via symlinks. The protection it was meant to
      // provide (hiding globally-installed skills at ~/.claude/skills/<name>/) is
      // unnecessary for nakiros skills, which live under ~/.nakiros/skills/ and
      // don't collide with Claude's global skill registry. See createIsolatedHome
      // in runner-core/isolated-home.ts (kept for potential future use).

      const run: SkillEvalRun = {
        runId,
        skillName: request.skillName,
        evalName: def.name,
        iteration,
        config,
        status: 'queued',
        sessionId: null,
        scope: request.scope,
        pluginName: request.pluginName,
        marketplaceName: request.marketplaceName,
        workdir: artifactDir,
        executionDir,
        usesSandbox: sandbox !== null,
        prompt: def.prompt,
        mode: def.mode ?? 'autonomous',
        outputFiles: def.outputFiles,
        isolatedHome: null,
        model: request.model ?? null,
        turns: [],
        tokensUsed: 0,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
      };

      const eventLog = new EventLog<EvalRunEvent['event']>({
        workdir: artifactDir,
        broadcast: (event) => options.onEvent({ runId, event }),
      });

      runs.set(run.runId, {
        run,
        child: null,
        onEvent: options.onEvent,
        killed: false,
        eventLog,
        sandbox,
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

    if (!options.skipBenchmarkWrite) {
      try {
        writeIterationBenchmark(skillDir, request.skillName, iteration);
      } catch (err) {
        console.error('[eval-runner] Failed to write benchmark.json:', err);
      }
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
    model: run.model ?? undefined,
    // No skipPermissions: eval runs rely on execution-dir-scoped settings.local.json
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
  // `blocks` tracks the interleaved order of text + tool events as they come
  // off the stream — so the UI can render a chat-style thread where each tool
  // call appears at the exact spot the agent emitted it, rather than all
  // grouped at the bottom of the assistant message.
  const blocks: Array<{ type: 'text'; text: string } | { type: 'tool'; name: string; display: string }> = [];

  run.status = 'running';
  writeRunJson(run);
  entry.eventLog.emit({ type: 'status', status: 'running' });

  // Run claude in the execution dir (git-worktree sandbox when available; the
  // artefact dir itself when we fell back to the legacy mode).
  const executionDir = run.executionDir ?? run.workdir;

  const result = await spawnClaudeTurn({
    workdir: executionDir,
    cliArgs,
    onChildSpawned: (c) => { entry.child = c; },
    isKilled: () => entry.killed,
    onSession: (id) => { run.sessionId = id; },
    onText: (text) => {
      assistantText += text;
      blocks.push({ type: 'text', text });
      entry.eventLog.emit({ type: 'text', text });
    },
    onTool: (name, display) => {
      tools.push({ name, display });
      blocks.push({ type: 'tool', name, display });
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
    blocks,
  });
  entry.child = null;

  if (result.exitCode !== 0 || result.error) {
    run.status = 'failed';
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    // Snapshot whatever partial state exists: copy outputs, freeze the diff,
    // then drop the sandbox. Without this, a failed sandbox run would leave
    // no trace of what the agent tried to do.
    teardownSandbox(entry);
    writeRunJson(run);
    saveTimingJson(run);
    entry.eventLog.emit({ type: 'done', exitCode: result.exitCode, error: result.error ?? undefined });
    entry.eventLog.destroy();
    deleteClaudeProjectEntry(executionDir);
  }
}

function allOutputFilesExist(run: SkillEvalRun): boolean {
  if (run.outputFiles.length === 0) return false;
  // Outputs live in the execution dir while the run is in flight (worktree or
  // fallback). The grader reads them from the artefact dir AFTER finalisation
  // because we copy-sync there.
  const dir = run.executionDir ?? run.workdir;
  for (const file of run.outputFiles) {
    if (!existsSync(join(dir, 'outputs', file))) return false;
  }
  return true;
}

async function finalizeRun(entry: RunEntry, definition: SkillEvalDefinition): Promise<void> {
  const { run } = entry;

  run.finishedAt = new Date().toISOString();

  run.status = 'grading';
  writeRunJson(run);
  entry.eventLog.emit({ type: 'status', status: 'grading' });

  const executionDirBeforeTeardown = run.executionDir ?? run.workdir;

  // Step 1: bring the outputs to the artefact dir so the LLM judge (which
  // reads `{workdir}/outputs/`) sees what the agent produced.
  syncOutputsToArtifact(executionDirBeforeTeardown, run.workdir);

  // Step 2: grade. Scripts run in the execution dir (sandbox still alive so
  // assertions can see modified tracked files). LLM assertions use the
  // artefact dir (outputs/ are there now).
  await gradeRun(run, definition, executionDirBeforeTeardown);

  // Step 3: freeze diff + drop the sandbox. Outputs were already synced above.
  teardownSandbox(entry);

  run.status = 'completed';
  writeRunJson(run);
  saveTimingJson(run);
  entry.eventLog.emit({ type: 'status', status: 'completed' });
  entry.eventLog.emit({ type: 'done', exitCode: 0 });

  // Conversation + events are superseded by grading.json; drop the replay log.
  entry.eventLog.destroy();
  // Claude-side project entry is redundant now that run.turns[] + grading.json
  // capture everything meaningful. Drop by the path the CLI actually ran in.
  deleteClaudeProjectEntry(executionDirBeforeTeardown);

  try {
    const iterDir = deriveIterDir(run);
    if (iterDir) writeIterationBenchmark(iterDir.skillDir, run.skillName, run.iteration);
  } catch (err) {
    console.error('[eval-runner] Failed to refresh benchmark.json:', err);
  }

  cleanupEvalArtifacts();
}

/**
 * Copy outputs/ into the artefact directory, save diff.patch (git-worktree
 * mode only), and destroy the sandbox. Idempotent — safe to call multiple
 * times (second call is a no-op because `entry.sandbox` has been cleared).
 */
function teardownSandbox(entry: RunEntry): void {
  const executionDir = entry.run.executionDir ?? entry.run.workdir;
  // 1. Copy whatever the agent produced into outputs/ so the grader sees it.
  syncOutputsToArtifact(executionDir, entry.run.workdir);
  // 2. Dispatch cleanup per sandbox kind.
  if (entry.sandbox?.kind === 'git-worktree') {
    saveSandboxDiff(entry.sandbox.path, entry.run.workdir);
    destroyEvalSandbox(entry.sandbox.path);
  } else if (entry.sandbox?.kind === 'tmp') {
    // No git diff meaningful for a fresh tmp dir — the whole sandbox was the
    // diff. We simply drop it.
    destroyTmpSandbox(entry.sandbox.path);
  }
  if (entry.sandbox) {
    entry.sandbox = null;
    // From this point on the run's execution dir no longer exists. Point it
    // at the artefact dir so subsequent reads (`getEvalBufferedEvents`,
    // `run.json` inspection) resolve correctly.
    entry.run.executionDir = entry.run.workdir;
    entry.run.usesSandbox = true; // keep the signal for the UI
  }
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
    // Preserve partial artefacts (outputs + diff) even on manual stop so the
    // user can inspect what the agent managed to do before interruption.
    const executionDirBeforeTeardown = entry.run.executionDir ?? entry.run.workdir;
    teardownSandbox(entry);
    writeRunJson(entry.run);
    entry.eventLog.emit({ type: 'status', status: 'stopped' });
    entry.eventLog.destroy();
    deleteClaudeProjectEntry(executionDirBeforeTeardown);
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
