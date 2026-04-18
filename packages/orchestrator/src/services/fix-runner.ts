import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

import type {
  AuditRun,
  AuditRunEvent,
  AuditRunStatus,
  AuditRunTurn,
  StartAuditRequest,
} from '@nakiros/shared';

const FACTORY_SKILL_NAME = 'nakiros-skill-factory';

/**
 * Two flavors of skill-factory-driven runs:
 * - `fix`    : the skill exists; copy it into a temp workdir, let the agent edit,
 *              sync back to the existing location on confirmation.
 * - `create` : the skill does NOT exist yet; start the agent with an empty temp
 *              workdir, sync back to the target location only if it still doesn't
 *              exist (to avoid clobbering).
 *
 * Both share the same runtime machinery (Claude CLI, stream buffering, resume,
 * interactive turns, Run-evals-in-temp). They differ only in workdir seeding,
 * first-turn prompt, and sync-back policy.
 */
export type SkillAgentMode = 'fix' | 'create';

interface FixEntry {
  mode: SkillAgentMode;
  run: AuditRun;
  child: ChildProcess | null;
  killed: boolean;
  /** Real skill directory (not the temp workdir) — used for the sync-back on finish. */
  realSkillDir: string;
  /** Temp workdir where the agent operates to avoid `.claude/` permission issues. */
  tempWorkdir: string;
  /**
   * Ring-ish buffer of the CURRENT turn's stream events (text + tool) so the UI
   * can replay them when the user closes FixView and reopens it mid-turn.
   * Capped to avoid unbounded growth on very long turns.
   * Reset on each `status=starting` transition (new turn).
   */
  currentTurnEvents: AuditRunEvent['event'][];
}

const MAX_BUFFERED_EVENTS_PER_TURN = 500;

/**
 * Recursively copy `src` to `dest`. No filtering — caller decides what to pass in.
 */
function copyDirRecursive(src: string, dest: string): void {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }

  mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

/**
 * Copy the skill's SOURCE material into the temp workdir. The fix agent's SKILL.md
 * says it reads the latest audit + the latest eval iteration — copying older ones
 * is dead weight, so we skip `audits/` and `evals/workspace/` at the top level and
 * selectively materialize only the latest of each via `copyLatestAudit` /
 * `copyLatestIteration`.
 */
function copySkillSourceForFix(src: string, dest: string): void {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }

  mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    if (entry.name === 'audits') continue; // handled by copyLatestAudit
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'evals') {
        // Copy evals/* except workspace/ (handled by copyLatestIteration)
        copyEvalsWithoutWorkspace(srcPath, destPath);
      } else {
        copyDirRecursive(srcPath, destPath);
      }
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

function copyEvalsWithoutWorkspace(src: string, dest: string): void {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === 'workspace') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else if (entry.isFile()) writeFileSync(destPath, readFileSync(srcPath));
  }
}

/** Copy only the newest audit file (by filename sort) into `{dest}/audits/`. */
function copyLatestAudit(realSkillDir: string, destSkillDir: string): string | null {
  const auditsDir = join(realSkillDir, 'audits');
  if (!existsSync(auditsDir)) return null;
  let names: string[];
  try {
    names = readdirSync(auditsDir).filter((n) => n.startsWith('audit-') && n.endsWith('.md'));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  // Filenames encode ISO timestamps → lexicographic sort == chronological sort.
  names.sort();
  const latest = names[names.length - 1];
  const destAuditsDir = join(destSkillDir, 'audits');
  mkdirSync(destAuditsDir, { recursive: true });
  writeFileSync(join(destAuditsDir, latest), readFileSync(join(auditsDir, latest)));
  return latest;
}

/** Copy only the highest-numbered iteration into `{dest}/evals/workspace/iteration-N/`. */
function copyLatestIteration(realSkillDir: string, destSkillDir: string): number | null {
  const workspaceDir = join(realSkillDir, 'evals', 'workspace');
  if (!existsSync(workspaceDir)) return null;
  let iterNums: number[];
  try {
    iterNums = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
      .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
      .filter((n) => !Number.isNaN(n));
  } catch {
    return null;
  }
  if (iterNums.length === 0) return null;
  const latest = Math.max(...iterNums);
  const src = join(workspaceDir, `iteration-${latest}`);
  const dest = join(destSkillDir, 'evals', 'workspace', `iteration-${latest}`);
  copyDirRecursive(src, dest);
  return latest;
}

/**
 * Paths (relative to the temp workdir) that are Nakiros-internal runtime state
 * and must NEVER be synced to the real skill.
 * - audits/, evals/workspace/ : runtime output, owned per-user
 * - run.json : fix-runner persistence blob
 * - .claude/ : the workdir's auto-accept settings, not part of the skill
 */
function isRuntimeOnlyPath(rel: string): boolean {
  if (rel === 'run.json') return true;
  if (rel === 'audits' || rel.startsWith('audits/')) return true;
  if (rel === '.claude' || rel.startsWith('.claude/')) return true;
  if (rel.startsWith('evals/workspace/') || rel === 'evals/workspace') return true;
  return false;
}

/**
 * Sync the temp workdir back into the real skill directory.
 * Additive: writes files that exist in temp (new or modified) into their matching path
 * in the real skill. Does NOT delete files from real that no longer exist in temp.
 * Skips Nakiros-internal runtime state (see `isRuntimeOnlyPath`).
 */
function syncBackToSkill(tempDir: string, realSkillDir: string): { filesCopied: number } {
  let filesCopied = 0;

  const walk = (dir: string) => {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(tempDir, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const destPath = join(realSkillDir, rel);
        mkdirSync(join(destPath, '..'), { recursive: true });
        writeFileSync(destPath, readFileSync(fullPath));
        filesCopied++;
      }
    }
  };

  walk(tempDir);
  return { filesCopied };
}

function cleanupTempWorkdir(tempDir: string): void {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Boot-time recovery: scan `~/.nakiros/tmp-skills/*` and either:
 *  - rehydrate a live fix/create entry when the temp workdir contains a `run.json`
 *    with a non-terminal status (app crashed mid-run — we treat the run as
 *    waiting_for_input so the user can resume via the same sessionId).
 *  - delete the temp workdir otherwise (truly orphan from a previous stopped run).
 *
 * We can't re-attach to the old Claude subprocess (it's dead), but the agent's
 * `sessionId` is preserved — the next `sendUserMessage` spawns a fresh process
 * with `--resume <sessionId>` and the conversation picks back up.
 */
export function restoreOrCleanupTempWorkdirs(): void {
  const tempRoot = join(homedir(), '.nakiros', 'tmp-skills');
  if (!existsSync(tempRoot)) return;

  let dirs: string[];
  try {
    dirs = readdirSync(tempRoot);
  } catch {
    return;
  }

  for (const name of dirs) {
    const workdir = join(tempRoot, name);
    const runJsonPath = join(workdir, 'run.json');
    if (!existsSync(runJsonPath)) {
      // No persisted state → truly orphan, safe to nuke.
      cleanupTempWorkdir(workdir);
      continue;
    }

    let blob: (AuditRun & { _mode?: SkillAgentMode; _realSkillDir?: string }) | null = null;
    try {
      blob = JSON.parse(readFileSync(runJsonPath, 'utf8'));
    } catch {
      // Corrupt file → can't recover; drop it.
      cleanupTempWorkdir(workdir);
      continue;
    }
    if (!blob || !blob.runId || !blob._mode || !blob._realSkillDir) {
      cleanupTempWorkdir(workdir);
      continue;
    }

    // Terminal runs that somehow didn't clean up — discard.
    if (blob.status === 'completed' || blob.status === 'failed' || blob.status === 'stopped') {
      cleanupTempWorkdir(workdir);
      continue;
    }

    // Non-terminal → rehydrate. Since the subprocess is gone, we can't finish whatever
    // turn was mid-flight. Collapse to waiting_for_input so the user can resume.
    const restoredRun: AuditRun = {
      runId: blob.runId,
      scope: blob.scope,
      projectId: blob.projectId,
      skillName: blob.skillName,
      status: 'waiting_for_input',
      sessionId: blob.sessionId ?? null,
      workdir: blob.workdir ?? workdir,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: null,
      error: null,
    };

    const entry: FixEntry = {
      mode: blob._mode,
      run: restoredRun,
      child: null,
      killed: false,
      realSkillDir: blob._realSkillDir,
      tempWorkdir: workdir,
      currentTurnEvents: [], // buffered events are lost across restarts — acceptable
    };
    fixes.set(restoredRun.runId, entry);
    persistRunJson(entry); // rewrite with the new 'waiting_for_input' status
    console.log(`[skill-agent-runner] Restored ${entry.mode} run ${restoredRun.runId} for "${restoredRun.skillName}" (sessionId=${restoredRun.sessionId ?? 'none'})`);
  }
}

/** Back-compat alias — old name from before we added restore semantics. */
export const cleanupOrphanTempWorkdirs = restoreOrCleanupTempWorkdirs;

const fixes = new Map<string, FixEntry>();
let counter = 0;

function generateRunId(): string {
  return `fix_${Date.now().toString(36)}_${(++counter).toString(36)}`;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * Build the temp workdir for a fix run:
 * - Located at ~/.nakiros/tmp-skills/{runId}/ (never inside `.claude/`)
 * - Contains a copy of the skill being fixed (excluding runtime artifacts)
 * - Includes a `.claude/settings.local.json` to auto-accept edits inside the workdir
 *
 * On finish, we sync the temp workdir BACK to the real skill directory.
 * This decouples editing (in temp) from persistence (in real dir) so that:
 *   - Claude's `.claude/` path protection is never triggered (cwd has no `.claude/` segment)
 *   - The original skill stays intact if the fix fails mid-way
 *   - (future) we can diff-preview changes before applying
 */
interface WorkdirContext {
  workdir: string;
  latestAuditFile: string | null;
  latestIteration: number | null;
}

/**
 * Build the temp workdir.
 * - `fix`    : seed with a lean copy of the existing skill (source + latest audit + latest iteration)
 * - `create` : start empty — the agent will write files from scratch
 */
function prepareWorkdir(mode: SkillAgentMode, realSkillDir: string, runId: string): WorkdirContext {
  const tempRoot = join(homedir(), '.nakiros', 'tmp-skills');
  mkdirSync(tempRoot, { recursive: true });

  const workdir = join(tempRoot, runId);
  mkdirSync(workdir, { recursive: true });

  let latestAuditFile: string | null = null;
  let latestIteration: number | null = null;

  if (mode === 'fix') {
    // Copy the skill source (SKILL.md, references/, assets/, scripts/, templates/,
    // evals/evals.json, evals/files/). Leaves out audits/ and evals/workspace/ —
    // those are materialized below, latest-only, to keep the temp workdir lean.
    copySkillSourceForFix(realSkillDir, workdir);
    latestAuditFile = copyLatestAudit(realSkillDir, workdir);
    latestIteration = copyLatestIteration(realSkillDir, workdir);
  }
  // mode === 'create': temp workdir stays empty (beyond .claude/settings.local.json below).

  // Auto-accept edits inside the workdir (no prompts needed here since we bypass already,
  // but keep it for explicitness and for potential future tightening).
  const claudeDir = join(workdir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'settings.local.json'),
    JSON.stringify(
      { permissions: { defaultMode: 'acceptEdits', allow: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] } },
      null,
      2,
    ),
    'utf8',
  );

  return { workdir, latestAuditFile, latestIteration };
}

function buildClaudeArgs(prompt: string, resumeSessionId?: string): string[] {
  // Fix runs are user-initiated and explicitly modify the skill directory.
  // We bypass permission prompts because:
  //  - the user has clicked "Fix" → intent is explicit
  //  - the workdir is scoped to the skill being fixed (nothing else is reachable)
  //  - .claude/** files are blocked by Claude Code's hard rule even with `acceptEdits`
  const args: string[] = [
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ];
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  args.push('--print', prompt);
  return args;
}

/**
 * Persist the run to `run.json` in the temp workdir. We stash the runner's
 * internal state (mode + realSkillDir) under underscore-prefixed fields so
 * `restoreEntriesFromDisk` can rehydrate the entry after an app crash / restart.
 */
function persistRunJson(entry: FixEntry): void {
  const blob = {
    ...entry.run,
    _mode: entry.mode,
    _realSkillDir: entry.realSkillDir,
  };
  try {
    writeFileSync(join(entry.run.workdir, 'run.json'), JSON.stringify(blob, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

// ─── Stream parsing (shared with audit) ─────────────────────────────────────

interface ClaudeHandlers {
  onSession(id: string): void;
  onText(text: string): void;
  onTool(name: string, display: string): void;
  onUsage(totalTokens: number): void;
}

function handleClaudeEvent(event: Record<string, unknown>, h: ClaudeHandlers): void {
  const type = event['type'] as string;
  if (type === 'system') {
    const sid = event['session_id'] as string | undefined;
    if (sid) h.onSession(sid);
    return;
  }
  if (type === 'assistant') {
    const sid = event['session_id'] as string | undefined;
    if (sid) h.onSession(sid);
    const message = event['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(message?.content)) return;
    for (const block of message!.content) {
      const b = block as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
      if (b.type === 'text' && b.text) h.onText(b.text);
      else if (b.type === 'tool_use' && b.name) h.onTool(b.name, formatTool(b.name, b.input ?? {}));
    }
    return;
  }
  if (type === 'result') {
    const usage = event['usage'] as { total_tokens?: number; input_tokens?: number; output_tokens?: number } | undefined;
    if (usage) {
      const total = usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      h.onUsage(total);
    }
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

// ─── Run lifecycle ──────────────────────────────────────────────────────────

interface RunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

/**
 * Return the active (non-terminal) run matching mode + skill identity, if any.
 * "Active" = starting | running | waiting_for_input. A completed/failed/stopped
 * run is considered disposed and will not be returned.
 */
function findActiveForSkill(
  mode: SkillAgentMode,
  scope: StartAuditRequest['scope'],
  projectId: string | undefined,
  skillName: string,
): FixEntry | null {
  for (const entry of fixes.values()) {
    if (entry.mode !== mode) continue;
    const { run } = entry;
    if (run.scope !== scope) continue;
    if (run.projectId !== projectId) continue;
    if (run.skillName !== skillName) continue;
    if (run.status === 'starting' || run.status === 'running' || run.status === 'waiting_for_input') {
      return entry;
    }
  }
  return null;
}

/** Core entry-point. Both `startFix` and `startCreate` are thin wrappers. */
function startSkillAgent(mode: SkillAgentMode, request: StartAuditRequest, opts: RunOpts): AuditRun {
  // Resume an already-active run for this (mode, scope, project, skill) instead of duplicating.
  const existing = findActiveForSkill(mode, request.scope, request.projectId, request.skillName);
  if (existing) {
    console.log(`[skill-agent-runner] Resuming active ${mode} ${existing.run.runId} for ${request.skillName} (status=${existing.run.status})`);
    return existing.run;
  }

  // For create: refuse if the target already exists — we'd otherwise overwrite the skill silently.
  if (mode === 'create' && existsSync(opts.skillDir)) {
    throw new Error(
      `Cannot create skill "${request.skillName}": target directory already exists (${opts.skillDir}). ` +
        `Pick a different name or run "fix" on the existing skill instead.`,
    );
  }

  const runId = generateRunId();
  const ctx = prepareWorkdir(mode, opts.skillDir, runId);

  const run: AuditRun = {
    runId,
    scope: request.scope,
    projectId: request.projectId,
    skillName: request.skillName,
    status: 'starting',
    sessionId: null,
    workdir: ctx.workdir,
    reportPath: null,
    turns: [],
    tokensUsed: 0,
    durationMs: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };

  const entry: FixEntry = {
    mode,
    run,
    child: null,
    killed: false,
    realSkillDir: opts.skillDir,
    tempWorkdir: ctx.workdir,
    currentTurnEvents: [],
  };
  fixes.set(run.runId, entry);
  persistRunJson(entry);

  const firstPrompt = buildFirstPrompt(mode, request, ctx, opts.skillDir);
  void executeTurn(entry, firstPrompt, true, opts).then(() => maybeWait(entry, opts));

  return run;
}

function buildFirstPrompt(
  mode: SkillAgentMode,
  request: StartAuditRequest,
  ctx: WorkdirContext,
  realSkillDir: string,
): string {
  if (mode === 'fix') {
    const auditLine = ctx.latestAuditFile
      ? `- Latest audit was copied to \`./audits/${ctx.latestAuditFile}\` — read it first.`
      : '- No prior audit for this skill — Nakiros did not copy any `./audits/` file.';
    const iterLine = ctx.latestIteration !== null
      ? `- Latest eval iteration was copied to \`./evals/workspace/iteration-${ctx.latestIteration}/\`. Read its \`benchmark.json\` and \`feedback.json\` for signals. Older iterations were intentionally NOT copied.`
      : '- No prior eval iteration — Nakiros did not copy any `./evals/workspace/`.';

    return `/${FACTORY_SKILL_NAME} fix ${request.skillName}

You are working on a TEMPORARY copy of the skill, located at your current working directory (\`${ctx.workdir}\`).
- Edit files here freely — all changes are synced back to the real skill (\`${realSkillDir}\`) when the user clicks "Sync to skill". If the user clicks "Discard", your changes are thrown away.
- All paths are relative to cwd: \`SKILL.md\`, \`references/\`, \`assets/\`, \`evals/\`, etc.
- IMPORTANT: before declaring any file missing, run \`ls -la <dir>/\` (or Glob) RECURSIVELY. Empty-looking subdirs usually just weren't inspected. Do not overwrite existing files without reading them first — the copy of the skill is complete.
${auditLine}
${iterLine}
- Between your turns, the user may click "Run evals" to re-run the eval suite against your in-progress edits. New iterations will appear in \`./evals/workspace/iteration-{N+1}/\`. Before you declare the fix ready, suggest running evals and then read the latest benchmark.json to confirm the delta is positive (no regression).
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
  }

  // mode === 'create'
  return `/${FACTORY_SKILL_NAME} create ${request.skillName}

You are creating a NEW skill from scratch. Your current working directory is a TEMPORARY workdir (\`${ctx.workdir}\`).
- Write every file of the skill here: \`SKILL.md\`, \`references/\`, \`assets/\`, \`scripts/\`, \`templates/\`, \`evals/evals.json\`, etc.
- All paths are relative to cwd. Do NOT try to write to \`${realSkillDir}\` directly — Nakiros will copy the whole workdir there when the user clicks "Create skill".
- If the user clicks "Discard", everything is thrown away.
- Follow your own \`create\` procedure: ASK the user the design questions first, then write using \`assets/templates/skill-template.md\` as the skeleton.
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
}

export function startFix(request: StartAuditRequest, opts: RunOpts): AuditRun {
  return startSkillAgent('fix', request, opts);
}

export function startCreate(request: StartAuditRequest, opts: RunOpts): AuditRun {
  return startSkillAgent('create', request, opts);
}

/**
 * Emit an event to the UI AND buffer text/tool events so a late-attaching
 * FixView can replay the current turn's stream.
 * The buffer is cleared on each 'starting' status (= new turn).
 */
function emit(entry: FixEntry, opts: RunOpts, event: AuditRunEvent['event']): void {
  if (event.type === 'status' && event.status === 'starting') {
    entry.currentTurnEvents = [];
  }
  if (event.type === 'text' || event.type === 'tool') {
    entry.currentTurnEvents.push(event);
    if (entry.currentTurnEvents.length > MAX_BUFFERED_EVENTS_PER_TURN) {
      entry.currentTurnEvents.shift();
    }
  }
  opts.onEvent({ runId: entry.run.runId, event });
}

async function executeTurn(
  entry: FixEntry,
  userMessage: string,
  isFirstTurn: boolean,
  opts: RunOpts,
): Promise<void> {
  const { run } = entry;
  if (entry.killed) return;

  run.status = 'starting';
  persistRunJson(entry);
  emit(entry, opts, { type: 'status', status: 'starting' });

  const cliArgs = buildClaudeArgs(userMessage, isFirstTurn ? undefined : (run.sessionId ?? undefined));

  const started = Date.now();
  run.turns.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

  let assistantText = '';
  const tools: { name: string; display: string }[] = [];
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
    persistRunJson(entry);
    emit(entry, opts, { type: 'status', status: 'running' });

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
            onSession: (id) => { run.sessionId = id; },
            onText: (text) => {
              assistantText += text;
              emit(entry, opts, { type: 'text', text });
            },
            onTool: (name, display) => {
              tools.push({ name, display });
              emit(entry, opts, { type: 'tool', name, display });
            },
            onUsage: (tokens) => {
              run.tokensUsed += tokens;
              emit(entry, opts, { type: 'tokens', tokensUsed: run.tokensUsed });
            },
          });
        } catch {
          // ignore non-JSON lines
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

  run.durationMs += Date.now() - started;
  run.turns.push({ role: 'assistant', content: assistantText, timestamp: new Date().toISOString(), tools });
  entry.child = null;

  if (exitCode !== 0 || errorMessage) {
    run.status = 'failed';
    run.error = errorMessage;
    run.finishedAt = new Date().toISOString();
    // Discard temp modifications on failure — same policy as stop
    cleanupTempWorkdir(entry.tempWorkdir);
    persistRunJson(entry);
    emit(entry, opts, { type: 'done', exitCode, error: errorMessage ?? undefined });
  }
}

/**
 * Fix runs don't auto-complete — the user decides when the work is done by clicking Finish.
 * After each turn, transition to waiting_for_input so the user can reply or finalize.
 */
function maybeWait(entry: FixEntry, opts: RunOpts): void {
  const { run } = entry;
  if (run.status === 'failed' || run.status === 'stopped') return;
  run.status = 'waiting_for_input';
  persistRunJson(entry);
  const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
  emit(entry, opts, { type: 'status', status: 'waiting_for_input' });
  emit(entry, opts, { type: 'waiting_for_input', lastAssistantText });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendFixUserMessage(runId: string, message: string, opts: RunOpts): Promise<void> {
  const entry = fixes.get(runId);
  if (!entry) throw new Error(`Fix run not found: ${runId}`);
  if (entry.run.status !== 'waiting_for_input') {
    throw new Error(`Fix run ${runId} is not waiting for input (status=${entry.run.status})`);
  }
  await executeTurn(entry, message, false, opts);
  maybeWait(entry, opts);
}

export function finishFix(runId: string, opts: RunOpts): void {
  const entry = fixes.get(runId);
  if (!entry) return;
  if (entry.run.status === 'completed' || entry.run.status === 'failed') return;

  // Create mode safety net: if the target appeared since we started (someone made the skill
  // in a different window), refuse the sync so we don't clobber it.
  if (entry.mode === 'create' && existsSync(entry.realSkillDir)) {
    entry.run.status = 'failed';
    entry.run.error = `Cannot finalize create: "${entry.realSkillDir}" already exists. Discard this run and pick a different skill name.`;
    entry.run.finishedAt = new Date().toISOString();
    persistRunJson(entry);
    opts.onEvent({ runId, event: { type: 'done', exitCode: 1, error: entry.run.error } });
    return;
  }

  // Sync the temp workdir back to the real skill directory
  let syncInfo = '';
  try {
    const result = syncBackToSkill(entry.tempWorkdir, entry.realSkillDir);
    syncInfo = ` (${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} synced)`;
  } catch (err) {
    entry.run.status = 'failed';
    entry.run.error = `Sync-back failed: ${(err as Error).message}`;
    entry.run.finishedAt = new Date().toISOString();
    persistRunJson(entry);
    opts.onEvent({ runId, event: { type: 'done', exitCode: 1, error: entry.run.error } });
    return;
  }

  cleanupTempWorkdir(entry.tempWorkdir);

  entry.run.status = 'completed';
  entry.run.finishedAt = new Date().toISOString();
  entry.run.error = null;
  persistRunJson(entry);
  console.log(`[skill-agent-runner] ${entry.mode} ${runId} completed${syncInfo}`);
  opts.onEvent({ runId, event: { type: 'status', status: 'completed' } });
  opts.onEvent({ runId, event: { type: 'done', exitCode: 0 } });
}

// Create runs share the same entry registry and lifecycle — these aliases make
// the intent at the call-site clear and match the IPC naming.
export const finishCreate = finishFix;
export const stopCreate = stopFix;
export const sendCreateUserMessage = sendFixUserMessage;
export const getCreateRun = getFixRun;
export const getCreateTempWorkdir = getFixTempWorkdir;
export const getCreateRealSkillDir = getFixRealSkillDir;

export function stopFix(runId: string): void {
  const entry = fixes.get(runId);
  if (!entry) return;
  entry.killed = true;
  entry.child?.kill('SIGTERM');

  // Stopped runs do NOT sync back — the temp modifications are discarded
  cleanupTempWorkdir(entry.tempWorkdir);

  if (entry.run.status !== 'completed' && entry.run.status !== 'failed') {
    entry.run.status = 'stopped';
    entry.run.finishedAt = new Date().toISOString();
    persistRunJson(entry);
  }
}

export function getFixRun(runId: string): AuditRun | null {
  return fixes.get(runId)?.run ?? null;
}

/**
 * Return the temp workdir path for a fix run.
 * Used by the eval runner to run evals against the temp copy before sync-back.
 */
export function getFixTempWorkdir(runId: string): string | null {
  return fixes.get(runId)?.tempWorkdir ?? null;
}

/** Return the real skill directory associated with a fix run. */
export function getFixRealSkillDir(runId: string): string | null {
  return fixes.get(runId)?.realSkillDir ?? null;
}

/**
 * Return the buffered stream events for the current (in-flight) turn.
 * Works for both fix and create runs (same runId space).
 */
export function getFixBufferedEvents(runId: string): AuditRunEvent['event'][] {
  return fixes.get(runId)?.currentTurnEvents.slice() ?? [];
}

export const getCreateBufferedEvents = getFixBufferedEvents;

function listActive(mode: SkillAgentMode): AuditRun[] {
  const out: AuditRun[] = [];
  for (const entry of fixes.values()) {
    if (entry.mode !== mode) continue;
    const s = entry.run.status;
    if (s === 'starting' || s === 'running' || s === 'waiting_for_input') {
      out.push(entry.run);
    }
  }
  return out;
}

/** List all active (non-terminal) fix runs. Used by the UI to surface "fix running" badges. */
export function listActiveFixRuns(): AuditRun[] {
  return listActive('fix');
}

/** List all active (non-terminal) create runs. */
export function listActiveCreateRuns(): AuditRun[] {
  return listActive('create');
}
