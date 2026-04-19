import { type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

import type {
  AuditRun,
  AuditRunEvent,
  SkillDiffEntry,
  SkillDiffFilePayload,
  StartAuditRequest,
} from '@nakiros/shared';

import {
  EventLog,
  buildClaudeArgs,
  deleteClaudeProjectEntry,
  generateRunId,
  loadRunJson,
  persistRunJson,
  spawnClaudeTurn,
} from './runner-core/index.js';

const FACTORY_SKILL_NAME = 'nakiros-skill-factory';

/**
 * Two flavors of skill-factory-driven runs:
 * - `fix`    : the skill exists; copy it into a temp workdir, let the agent edit,
 *              sync back to the existing location on confirmation.
 * - `create` : the skill does NOT exist yet; start the agent with an empty temp
 *              workdir, sync back to the target location only if it still doesn't
 *              exist (to avoid clobbering).
 *
 * Both share the same runtime machinery (runner-core: Claude CLI, event log,
 * resume, interactive turns, Run-evals-in-temp). They differ only in workdir
 * seeding, first-turn prompt, and sync-back policy.
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
   * Replay log for the CURRENT turn. Persisted to `{workdir}/events.jsonl` so
   * both remount-mid-turn AND daemon-restart survive without losing the stream.
   */
  eventLog: EventLog<AuditRunEvent['event']>;
}

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
 */
function isRuntimeOnlyPath(rel: string): boolean {
  if (rel === 'run.json' || rel === 'events.jsonl') return true;
  if (rel === 'audits' || rel.startsWith('audits/')) return true;
  if (rel === '.claude' || rel.startsWith('.claude/')) return true;
  if (rel.startsWith('evals/workspace/') || rel === 'evals/workspace') return true;
  return false;
}

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
  // The claude CLI registered `tempDir` as a project under
  // `~/.claude/projects/`; drop that entry so we don't leak one row per run.
  deleteClaudeProjectEntry(tempDir);
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
 * with `--resume <sessionId>` and the conversation picks back up. The EventLog
 * is also restored from `events.jsonl` so the user sees the last streamed chunks
 * of the interrupted turn when they reopen the view.
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
    const blob = loadRunJson<AuditRun & { _mode?: SkillAgentMode; _realSkillDir?: string }>(workdir);
    if (!blob) {
      cleanupTempWorkdir(workdir);
      continue;
    }
    if (!blob.runId || !blob._mode || !blob._realSkillDir) {
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
      eventLog: new EventLog({
        workdir,
        broadcast: () => { /* no listener yet; first real event will replace this log */ },
      }),
    };
    entry.eventLog.restore();
    fixes.set(restoredRun.runId, entry);
    writeRunJson(entry); // rewrite with the new 'waiting_for_input' status
    console.log(`[skill-agent-runner] Restored ${entry.mode} run ${restoredRun.runId} for "${restoredRun.skillName}" (sessionId=${restoredRun.sessionId ?? 'none'})`);
  }
}

/** Back-compat alias — old name from before we added restore semantics. */
export const cleanupOrphanTempWorkdirs = restoreOrCleanupTempWorkdirs;

const fixes = new Map<string, FixEntry>();

// ─── Setup ──────────────────────────────────────────────────────────────────

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
    copySkillSourceForFix(realSkillDir, workdir);
    latestAuditFile = copyLatestAudit(realSkillDir, workdir);
    latestIteration = copyLatestIteration(realSkillDir, workdir);
  }

  // Auto-accept edits inside the workdir (explicit — even though we pass
  // --dangerously-skip-permissions too, keep this for potential future tightening).
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

/**
 * Persist the run to `run.json` in the temp workdir. We stash the runner's
 * internal state (mode + realSkillDir) under underscore-prefixed fields so
 * `restoreOrCleanupTempWorkdirs` can rehydrate the entry after a daemon restart.
 */
function writeRunJson(entry: FixEntry): void {
  persistRunJson(entry.run.workdir, {
    ...entry.run,
    _mode: entry.mode,
    _realSkillDir: entry.realSkillDir,
  });
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
  const existing = findActiveForSkill(mode, request.scope, request.projectId, request.skillName);
  if (existing) {
    console.log(`[skill-agent-runner] Resuming active ${mode} ${existing.run.runId} for ${request.skillName} (status=${existing.run.status})`);
    // Rebind the EventLog's broadcast listener to this fresh caller so the
    // resumed session's events reach the new websocket subscriber.
    rebindEventLog(existing, opts);
    return existing.run;
  }

  if (mode === 'create' && existsSync(opts.skillDir)) {
    throw new Error(
      `Cannot create skill "${request.skillName}": target directory already exists (${opts.skillDir}). ` +
        `Pick a different name or run "fix" on the existing skill instead.`,
    );
  }

  const runId = generateRunId(mode);
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
    eventLog: new EventLog<AuditRunEvent['event']>({
      workdir: ctx.workdir,
      broadcast: (event) => opts.onEvent({ runId: run.runId, event }),
    }),
  };
  fixes.set(run.runId, entry);
  writeRunJson(entry);

  const firstPrompt = buildFirstPrompt(mode, request, ctx, opts.skillDir);
  void executeTurn(entry, firstPrompt, true).then(() => maybeWait(entry));

  return run;
}

/**
 * Re-point an existing entry's event log broadcast to the current caller. The
 * EventLog itself (and its in-memory buffer) is preserved — only the "who to
 * broadcast to" function is swapped. Used when a fresh `startSkillAgent` call
 * resumes an already-active run.
 */
function rebindEventLog(entry: FixEntry, opts: RunOpts): void {
  const buffered = entry.eventLog.getBuffered();
  entry.eventLog = new EventLog<AuditRunEvent['event']>({
    workdir: entry.tempWorkdir,
    broadcast: (event) => opts.onEvent({ runId: entry.run.runId, event }),
  });
  // Restore the in-memory buffer so getBufferedEvents stays accurate without
  // re-reading the jsonl file.
  for (const ev of buffered) {
    // Bypass broadcast (don't replay to the new listener; the frontend replays
    // explicitly via getBufferedEvents at mount time).
    (entry.eventLog as unknown as { buffer: unknown[] }).buffer.push(ev);
  }
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

async function executeTurn(
  entry: FixEntry,
  userMessage: string,
  isFirstTurn: boolean,
): Promise<void> {
  const { run } = entry;
  if (entry.killed) return;

  entry.eventLog.resetForNewTurn();
  run.status = 'starting';
  writeRunJson(entry);
  entry.eventLog.emit({ type: 'status', status: 'starting' });

  const cliArgs = buildClaudeArgs({
    prompt: userMessage,
    resumeSessionId: isFirstTurn ? undefined : (run.sessionId ?? undefined),
    // Fix/create runs are user-initiated and explicitly modify the skill directory.
    // The workdir is scoped (nothing else is reachable); .claude/** files stay blocked
    // by Claude Code's hard rule even with `acceptEdits`.
    skipPermissions: true,
  });

  const started = Date.now();
  run.turns.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

  let assistantText = '';
  const tools: { name: string; display: string }[] = [];
  // Ordered interleaved blocks so the UI can render text and tool calls in
  // the exact sequence the agent emitted them (chat-style thread).
  const blocks: Array<{ type: 'text'; text: string } | { type: 'tool'; name: string; display: string }> = [];

  run.status = 'running';
  writeRunJson(entry);
  entry.eventLog.emit({ type: 'status', status: 'running' });

  const result = await spawnClaudeTurn({
    workdir: run.workdir,
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
  run.turns.push({ role: 'assistant', content: assistantText, timestamp: new Date().toISOString(), tools, blocks });
  entry.child = null;

  if (result.exitCode !== 0 || result.error) {
    run.status = 'failed';
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    // Discard temp modifications on failure — same policy as stop
    entry.eventLog.destroy();
    cleanupTempWorkdir(entry.tempWorkdir);
    writeRunJson(entry);
    entry.eventLog.emit({ type: 'done', exitCode: result.exitCode, error: result.error ?? undefined });
  }
}

/**
 * Fix runs don't auto-complete — the user decides when the work is done by clicking Finish.
 * After each turn, transition to waiting_for_input so the user can reply or finalize.
 */
function maybeWait(entry: FixEntry): void {
  const { run } = entry;
  if (run.status === 'failed' || run.status === 'stopped') return;
  run.status = 'waiting_for_input';
  writeRunJson(entry);
  const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
  entry.eventLog.emit({ type: 'status', status: 'waiting_for_input' });
  entry.eventLog.emit({ type: 'waiting_for_input', lastAssistantText });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendFixUserMessage(runId: string, message: string, opts: RunOpts): Promise<void> {
  const entry = fixes.get(runId);
  if (!entry) throw new Error(`Fix run not found: ${runId}`);
  if (entry.run.status !== 'waiting_for_input') {
    throw new Error(`Fix run ${runId} is not waiting for input (status=${entry.run.status})`);
  }
  rebindEventLog(entry, opts);
  await executeTurn(entry, message, false);
  maybeWait(entry);
}

export function finishFix(runId: string, opts: RunOpts): void {
  const entry = fixes.get(runId);
  if (!entry) return;
  if (entry.run.status === 'completed' || entry.run.status === 'failed') return;
  rebindEventLog(entry, opts);

  // Create mode safety net: if the target appeared since we started, refuse to sync.
  if (entry.mode === 'create' && existsSync(entry.realSkillDir)) {
    entry.run.status = 'failed';
    entry.run.error = `Cannot finalize create: "${entry.realSkillDir}" already exists. Discard this run and pick a different skill name.`;
    entry.run.finishedAt = new Date().toISOString();
    writeRunJson(entry);
    opts.onEvent({ runId, event: { type: 'done', exitCode: 1, error: entry.run.error } });
    return;
  }

  let syncInfo = '';
  try {
    const result = syncBackToSkill(entry.tempWorkdir, entry.realSkillDir);
    syncInfo = ` (${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} synced)`;
  } catch (err) {
    entry.run.status = 'failed';
    entry.run.error = `Sync-back failed: ${(err as Error).message}`;
    entry.run.finishedAt = new Date().toISOString();
    writeRunJson(entry);
    opts.onEvent({ runId, event: { type: 'done', exitCode: 1, error: entry.run.error } });
    return;
  }

  entry.eventLog.destroy();
  cleanupTempWorkdir(entry.tempWorkdir);

  entry.run.status = 'completed';
  entry.run.finishedAt = new Date().toISOString();
  entry.run.error = null;
  console.log(`[skill-agent-runner] ${entry.mode} ${runId} completed${syncInfo}`);
  opts.onEvent({ runId, event: { type: 'status', status: 'completed' } });
  opts.onEvent({ runId, event: { type: 'done', exitCode: 0 } });
}

// Create runs share the same entry registry and lifecycle.
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

  if (entry.run.status !== 'completed' && entry.run.status !== 'failed') {
    entry.run.status = 'stopped';
    entry.run.finishedAt = new Date().toISOString();
  }
  // Broadcast BEFORE tearing down so the frontend reacts instantly.
  entry.eventLog.emit({ type: 'status', status: 'stopped' });
  entry.eventLog.emit({ type: 'done', exitCode: 130 });

  // Stopped runs do NOT sync back — the temp modifications are discarded.
  entry.eventLog.destroy();
  cleanupTempWorkdir(entry.tempWorkdir);
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
  return fixes.get(runId)?.eventLog.getBuffered() ?? [];
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

/** List all active (non-terminal) fix runs. */
export function listActiveFixRuns(): AuditRun[] {
  return listActive('fix');
}

/** List all active (non-terminal) create runs. */
export function listActiveCreateRuns(): AuditRun[] {
  return listActive('create');
}

// ─── Review diff API ─────────────────────────────────────────────────────────

/**
 * Walk a skill directory and return every file path (relative to the root)
 * that is NOT runtime-only. Used on both real skill and temp workdir so the
 * comparison sees the same things the sync step would actually copy.
 */
function listSyncableFiles(root: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(root, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }
  walk(root);
  results.sort();
  return results;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(4096, buffer.length));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function readPair(relativePath: string, originalDir: string | null, modifiedDir: string): SkillDiffFilePayload {
  let originalContent: string | null = null;
  let modifiedContent: string | null = null;
  let isBinary = false;

  if (originalDir) {
    const origPath = join(originalDir, relativePath);
    if (existsSync(origPath)) {
      const buf = readFileSync(origPath);
      if (isLikelyBinary(buf)) isBinary = true;
      else originalContent = buf.toString('utf8');
    }
  }

  const modPath = join(modifiedDir, relativePath);
  if (existsSync(modPath)) {
    const buf = readFileSync(modPath);
    if (isLikelyBinary(buf)) isBinary = true;
    else modifiedContent = buf.toString('utf8');
  }

  return {
    relativePath,
    originalContent: isBinary ? null : originalContent,
    modifiedContent: isBinary ? null : modifiedContent,
    isBinary,
  };
}

/**
 * List the files that would differ between the real skill (before-state) and
 * the current temp workdir (after-state). Files that are identical are excluded.
 * `create` runs surface every file in the temp workdir since the original does
 * not exist yet.
 */
export function listFixDiff(runId: string): SkillDiffEntry[] {
  const entry = fixes.get(runId);
  if (!entry) return [];
  const realDir = entry.realSkillDir;
  const tempDir = entry.tempWorkdir;
  const isCreate = entry.mode === 'create';

  const originalExists = !isCreate && existsSync(realDir);
  const originalPaths = originalExists ? new Set(listSyncableFiles(realDir)) : new Set<string>();
  const modifiedPaths = new Set(listSyncableFiles(tempDir));

  const all = new Set<string>([...originalPaths, ...modifiedPaths]);
  const diffs: SkillDiffEntry[] = [];
  for (const rel of [...all].sort()) {
    const inOriginal = originalPaths.has(rel);
    const inModified = modifiedPaths.has(rel);
    if (inOriginal && inModified) {
      // Skip bytewise-identical files to keep the list focused on real changes.
      try {
        const a = readFileSync(join(realDir, rel));
        const b = readFileSync(join(tempDir, rel));
        if (a.equals(b)) continue;
      } catch {
        // surface as a diff entry if we can't read — UI will show the error
      }
    }
    diffs.push({ relativePath: rel, inOriginal, inModified });
  }
  return diffs;
}

export function readFixDiffFile(runId: string, relativePath: string): SkillDiffFilePayload {
  const entry = fixes.get(runId);
  if (!entry) throw new Error(`Unknown run: ${runId}`);
  if (relativePath.includes('..')) throw new Error(`Refused suspicious path: ${relativePath}`);
  if (isRuntimeOnlyPath(relativePath)) {
    throw new Error(`Refused runtime-only path: ${relativePath}`);
  }
  const realDir = entry.realSkillDir;
  const originalDir = entry.mode === 'create' ? null : existsSync(realDir) ? realDir : null;
  return readPair(relativePath, originalDir, entry.tempWorkdir);
}
