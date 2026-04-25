import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import type { Dirent } from 'fs';
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
  cleanupRunWorkdir,
  createRunner,
  isActiveRunStatus,
  type RehydrateResult,
  type RunEntry,
  type RunOpts,
  type RunnerSpec,
  writeExecutionSettings,
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
 * Both share the same runtime machinery via `createRunner`. They differ only in
 * workdir seeding, first-turn prompt, and sync-back policy.
 */
export type SkillAgentMode = 'fix' | 'create';

interface SkillAgentExtras {
  mode: SkillAgentMode;
  /** Real skill directory (not the temp workdir) — used for the sync-back on finish. */
  realSkillDir: string;
  /** Cached during prepareWorkdir so buildFirstPrompt can reference them. */
  latestAuditFile?: string | null;
  latestIteration?: number | null;
}

/** Internal start request — `StartAuditRequest` + the resolved skill dir + mode. */
interface SkillAgentStartReq extends StartAuditRequest {
  skillDir: string;
  mode: SkillAgentMode;
}

type FixEvent = AuditRunEvent['event'];
type FixEntry = RunEntry<AuditRun, FixEvent, SkillAgentExtras>;

function tempRoot(): string {
  return join(homedir(), '.nakiros', 'tmp-skills');
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────

/** Recursively copy `src` to `dest`. No filtering — caller decides what to pass in. */
function copyDirRecursive(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else if (entry.isFile()) writeFileSync(destPath, readFileSync(srcPath));
  }
}

/**
 * Copy the skill's SOURCE material into the temp workdir, skipping `audits/`
 * and `evals/workspace/` at the top level (those are handled selectively by
 * `copyLatestAudit` / `copyLatestIteration` to avoid bloat).
 */
function copySkillSourceForFix(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === 'audits') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'evals') copyEvalsWithoutWorkspace(srcPath, destPath);
      else copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

function copyEvalsWithoutWorkspace(src: string, dest: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
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
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(tempDir, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) {
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

// ─── Spec ──────────────────────────────────────────────────────────────────

const spec: RunnerSpec<AuditRun, SkillAgentStartReq, FixEvent, SkillAgentExtras> = {
  kind: 'skill-agent',
  runsRoot: tempRoot,

  runIdPrefix(req) {
    return req.mode;
  },

  prepareWorkdir(req, runId) {
    if (req.mode === 'create' && existsSync(req.skillDir)) {
      throw new Error(
        `Cannot create skill "${req.skillName}": target directory already exists (${req.skillDir}). ` +
          `Pick a different name or run "fix" on the existing skill instead.`,
      );
    }

    const workdir = join(tempRoot(), runId);
    mkdirSync(workdir, { recursive: true });

    let latestAuditFile: string | null = null;
    let latestIteration: number | null = null;

    if (req.mode === 'fix') {
      copySkillSourceForFix(req.skillDir, workdir);
      latestAuditFile = copyLatestAudit(req.skillDir, workdir);
      latestIteration = copyLatestIteration(req.skillDir, workdir);
    }

    writeExecutionSettings(workdir);

    return {
      workdir,
      extras: {
        mode: req.mode,
        realSkillDir: req.skillDir,
        latestAuditFile,
        latestIteration,
      },
    };
  },

  buildFirstPrompt(req, ctx) {
    const { workdir, extras } = ctx;
    if (req.mode === 'fix') {
      const auditLine = extras.latestAuditFile
        ? `- Latest audit was copied to \`./audits/${extras.latestAuditFile}\` — read it first.`
        : '- No prior audit for this skill — Nakiros did not copy any `./audits/` file.';
      const iterLine = extras.latestIteration !== null && extras.latestIteration !== undefined
        ? `- Latest eval iteration was copied to \`./evals/workspace/iteration-${extras.latestIteration}/\`. Read its \`benchmark.json\` and \`feedback.json\` for signals. Older iterations were intentionally NOT copied.`
        : '- No prior eval iteration — Nakiros did not copy any `./evals/workspace/`.';

      return `/${FACTORY_SKILL_NAME} fix ${req.skillName}

You are working on a TEMPORARY copy of the skill, located at your current working directory (\`${workdir}\`).
- Edit files here freely — all changes are synced back to the real skill (\`${extras.realSkillDir}\`) when the user clicks "Sync to skill". If the user clicks "Discard", your changes are thrown away.
- All paths are relative to cwd: \`SKILL.md\`, \`references/\`, \`assets/\`, \`evals/\`, etc.
- IMPORTANT: before declaring any file missing, run \`ls -la <dir>/\` (or Glob) RECURSIVELY. Empty-looking subdirs usually just weren't inspected. Do not overwrite existing files without reading them first — the copy of the skill is complete.
${auditLine}
${iterLine}
- Between your turns, the user may click "Run evals" to re-run the eval suite against your in-progress edits. New iterations will appear in \`./evals/workspace/iteration-{N+1}/\`. Before you declare the fix ready, suggest running evals and then read the latest benchmark.json to confirm the delta is positive (no regression).
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
    }

    return `/${FACTORY_SKILL_NAME} create ${req.skillName}

You are creating a NEW skill from scratch. Your current working directory is a TEMPORARY workdir (\`${workdir}\`).
- Write every file of the skill here: \`SKILL.md\`, \`references/\`, \`assets/\`, \`scripts/\`, \`templates/\`, \`evals/evals.json\`, etc.
- All paths are relative to cwd. Do NOT try to write to \`${extras.realSkillDir}\` directly — Nakiros will copy the whole workdir there when the user clicks "Create skill".
- If the user clicks "Discard", everything is thrown away.
- Follow your own \`create\` procedure: ASK the user the design questions first, then write using \`assets/templates/skill-template.md\` as the skeleton.
- Do not modify \`.claude/settings.local.json\` in this workdir — it's Nakiros's runtime config.`;
  },

  createInitialRun(req, runId, workdir): AuditRun {
    return {
      runId,
      scope: req.scope,
      projectId: req.projectId,
      pluginName: req.pluginName,
      marketplaceName: req.marketplaceName,
      skillName: req.skillName,
      status: 'starting',
      sessionId: null,
      workdir,
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
      resumeSessionId: isFirstTurn ? undefined : (entry.run.sessionId ?? undefined),
      // Fix/create runs are user-initiated and explicitly modify the skill directory.
      // The workdir is scoped (nothing else is reachable); .claude/** files stay blocked
      // by Claude Code's hard rule even with `acceptEdits`.
      skipPermissions: true,
    };
  },

  /** Fix/create runs never auto-complete — always wait for user input after a turn. */
  onTurnComplete(entry, helpers) {
    helpers.wait(entry);
  },

  /** Discard temp modifications on failure — same policy as stop. */
  onTurnFailed(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  cleanupOnTerminal(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  /**
   * User-confirmed completion. Sync the temp workdir BACK to the real skill
   * (replacing the existing source tree for `fix`, creating the skill dir for
   * `create`), then let the factory destroy the temp workdir + remove the
   * registry entry.
   *
   * Safety net for `create` mode: if the target appeared since start, refuse
   * to sync and mark the run failed.
   */
  finish(entry, opts) {
    const { extras, run } = entry;

    if (extras.mode === 'create' && existsSync(extras.realSkillDir)) {
      run.status = 'failed';
      run.error = `Cannot finalize create: "${extras.realSkillDir}" already exists. Discard this run and pick a different skill name.`;
      run.finishedAt = new Date().toISOString();
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
      return;
    }

    let syncInfo = '';
    try {
      const result = syncBackToSkill(run.workdir, extras.realSkillDir);
      syncInfo = ` (${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} synced)`;
    } catch (err) {
      run.status = 'failed';
      run.error = `Sync-back failed: ${(err as Error).message}`;
      run.finishedAt = new Date().toISOString();
      opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
      return;
    }

    run.status = 'completed';
    run.finishedAt = new Date().toISOString();
    run.error = null;
    console.log(`[skill-agent-runner] ${extras.mode} ${run.runId} completed${syncInfo}`);
    opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0 } });
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.extras.mode !== req.mode) continue;
      const { run } = entry;
      if (run.scope !== req.scope) continue;
      if (run.projectId !== req.projectId) continue;
      if (run.skillName !== req.skillName) continue;
      if (isActiveRunStatus(run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<AuditRun, SkillAgentExtras> {
    const blob = persisted as
      | (AuditRun & {
          _extras?: SkillAgentExtras;
          _mode?: SkillAgentMode;
          _realSkillDir?: string;
        })
      | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    // Legacy persistence stored mode + realSkillDir as `_mode` / `_realSkillDir`.
    const mode = blob._extras?.mode ?? blob._mode;
    const realSkillDir = blob._extras?.realSkillDir ?? blob._realSkillDir;
    if (!mode || !realSkillDir) return { kind: 'cleanup' };

    // Terminal runs that somehow didn't clean up — discard.
    if (blob.status === 'completed' || blob.status === 'failed' || blob.status === 'stopped') {
      return { kind: 'cleanup' };
    }

    // Non-terminal → rehydrate. Subprocess is gone; collapse to waiting_for_input
    // so the user can resume via --resume.
    const restoredRun: AuditRun = {
      runId: blob.runId,
      scope: blob.scope,
      projectId: blob.projectId,
      pluginName: blob.pluginName,
      marketplaceName: blob.marketplaceName,
      skillName: blob.skillName,
      status: 'waiting_for_input',
      sessionId: blob.sessionId ?? null,
      workdir,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: null,
      error: null,
    };

    console.log(
      `[skill-agent-runner] Restored ${mode} run ${restoredRun.runId} for "${restoredRun.skillName}" (sessionId=${restoredRun.sessionId ?? 'none'})`,
    );

    return {
      kind: 'rehydrate',
      run: restoredRun,
      extras: { mode, realSkillDir },
    };
  },
};

const runner = createRunner(spec);

// ─── Public API ─────────────────────────────────────────────────────────────

interface ExternalRunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

function asInternalOpts(opts: ExternalRunOpts): RunOpts<FixEvent> {
  return { onEvent: opts.onEvent };
}

/**
 * Boot-time recovery: scan `~/.nakiros/tmp-skills/*` and rehydrate any
 * non-terminal fix/create run. Terminal leftovers are deleted. Reusable
 * subprocesses are gone after a daemon restart, but the agent's `sessionId`
 * is preserved — the next `sendUserMessage` spawns a fresh process with
 * `--resume <sessionId>` and the conversation picks back up.
 */
export function restoreOrCleanupTempWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — first IPC call rebinds */
  });
}

/** Back-compat alias — old name from before we added restore semantics. */
export const cleanupOrphanTempWorkdirs = restoreOrCleanupTempWorkdirs;

/**
 * Start (or resume) a fix run on an existing skill. Seeds the temp workdir
 * with a lean copy of the skill (source + latest audit + latest iteration),
 * then lets the agent edit under `/nakiros-skill-factory fix`. Sync-back to
 * the real skill happens on {@link finishFix}.
 */
export function startFix(request: StartAuditRequest, opts: ExternalRunOpts): AuditRun {
  return runner.start({ ...request, mode: 'fix', skillDir: opts.skillDir }, asInternalOpts(opts));
}

/**
 * Start (or resume) a create run for a new skill. Starts with an empty temp
 * workdir; the agent writes SKILL.md + friends from scratch. Sync-back only
 * fires if the target skill still doesn't exist when the user clicks Create.
 */
export function startCreate(request: StartAuditRequest, opts: ExternalRunOpts): AuditRun {
  return runner.start({ ...request, mode: 'create', skillDir: opts.skillDir }, asInternalOpts(opts));
}

/**
 * Forward a user message to a fix/create run in `waiting_for_input`. Re-binds
 * the event log, executes one claude turn via `--resume`, then transitions
 * back to `waiting_for_input` so the user can continue (fix runs never
 * auto-complete).
 */
export async function sendFixUserMessage(runId: string, message: string, opts: ExternalRunOpts): Promise<void> {
  await runner.sendUserMessage(runId, message, asInternalOpts(opts));
}

/**
 * User-confirmed completion. Syncs the temp workdir BACK to the real skill,
 * tears down the workdir + event log, and marks the run completed.
 */
export function finishFix(runId: string, opts: ExternalRunOpts): void {
  runner.finish(runId, asInternalOpts(opts));
}

/**
 * Cancel an in-flight fix/create run: `SIGTERM` the child, collapse status to
 * `stopped`, emit final events, delete the temp workdir + event log. Stopped
 * runs do NOT sync back — temp modifications are discarded.
 */
export function stopFix(runId: string): void {
  runner.stop(runId);
}

// Create runs share the same registry and lifecycle.
export const finishCreate = finishFix;
export const stopCreate = stopFix;
export const sendCreateUserMessage = sendFixUserMessage;
export const getCreateRun = getFixRun;
export const getCreateTempWorkdir = getFixTempWorkdir;
export const getCreateRealSkillDir = getFixRealSkillDir;
export const getCreateBufferedEvents = getFixBufferedEvents;

/** Look up a fix or create run by id. Both run kinds share the registry. */
export function getFixRun(runId: string): AuditRun | null {
  return runner.getRun(runId);
}

/**
 * Return the temp workdir path for a fix run. Used by the eval runner to run
 * evals against the temp copy before sync-back.
 */
export function getFixTempWorkdir(runId: string): string | null {
  const entry = runner.registry().get(runId);
  return entry?.run.workdir ?? null;
}

/** Return the real skill directory associated with a fix run. */
export function getFixRealSkillDir(runId: string): string | null {
  const entry = runner.registry().get(runId);
  return entry?.extras.realSkillDir ?? null;
}

/**
 * Return the buffered stream events for the current (in-flight) turn. Works
 * for both fix and create runs (same runId space).
 */
export function getFixBufferedEvents(runId: string): FixEvent[] {
  return runner.getBufferedEvents(runId);
}

function listByMode(mode: SkillAgentMode, opts: { activeOnly: boolean }): AuditRun[] {
  const out: AuditRun[] = [];
  for (const entry of runner.registry().values()) {
    if (entry.extras.mode !== mode) continue;
    if (opts.activeOnly && !isActiveRunStatus(entry.run.status)) continue;
    out.push(entry.run);
  }
  return out;
}

/** List every non-terminal fix run (starting / running / waiting_for_input). */
export function listActiveFixRuns(): AuditRun[] {
  return listByMode('fix', { activeOnly: true });
}

/** List every non-terminal create run (starting / running / waiting_for_input). */
export function listActiveCreateRuns(): AuditRun[] {
  return listByMode('create', { activeOnly: true });
}

/** List every fix run currently in memory — active **and** terminal — for the runs center. */
export function listAllFixRuns(): AuditRun[] {
  return listByMode('fix', { activeOnly: false });
}

/** List every create run currently in memory — active **and** terminal — for the runs center. */
export function listAllCreateRuns(): AuditRun[] {
  return listByMode('create', { activeOnly: false });
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
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(root, fullPath);
      if (isRuntimeOnlyPath(rel)) continue;
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) results.push(rel);
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
 * List every file that exists either in the original skill or in the temp
 * workdir. The UI uses this to render the before/after file picker in the
 * diff preview panel. Entries carry `inOriginal` / `inModified` flags so
 * created / deleted / modified states render distinctly.
 */
export function listFixDiff(runId: string): SkillDiffEntry[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const realDir = entry.extras.realSkillDir;
  const tempDir = entry.run.workdir;
  const isCreate = entry.extras.mode === 'create';

  const originalExists = !isCreate && existsSync(realDir);
  const originalPaths = originalExists ? new Set(listSyncableFiles(realDir)) : new Set<string>();
  const modifiedPaths = new Set(listSyncableFiles(tempDir));

  const all = new Set<string>([...originalPaths, ...modifiedPaths]);
  const diffs: SkillDiffEntry[] = [];
  for (const rel of [...all].sort()) {
    const inOriginal = originalPaths.has(rel);
    const inModified = modifiedPaths.has(rel);
    if (inOriginal && inModified) {
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

/**
 * Read one file from BOTH the original skill and the temp workdir, returning
 * their contents side-by-side for the diff viewer. Binary files are flagged
 * so the UI can fall back to an opaque message instead of garbling the view.
 */
export function readFixDiffFile(runId: string, relativePath: string): SkillDiffFilePayload {
  const entry = runner.registry().get(runId);
  if (!entry) throw new Error(`Unknown run: ${runId}`);
  if (relativePath.includes('..')) throw new Error(`Refused suspicious path: ${relativePath}`);
  if (isRuntimeOnlyPath(relativePath)) {
    throw new Error(`Refused runtime-only path: ${relativePath}`);
  }
  const realDir = entry.extras.realSkillDir;
  const originalDir = entry.extras.mode === 'create' ? null : existsSync(realDir) ? realDir : null;
  return readPair(relativePath, originalDir, entry.run.workdir);
}
