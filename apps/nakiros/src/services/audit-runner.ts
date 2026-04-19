import { type ChildProcess } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

import type {
  AuditHistoryEntry,
  AuditRun,
  AuditRunEvent,
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

interface AuditEntry {
  run: AuditRun;
  child: ChildProcess | null;
  killed: boolean;
  /** Absolute path to the real skill directory — used to archive the audit report. */
  skillDir: string;
  /** Replay log persisted to `{workdir}/events.jsonl`. */
  eventLog: EventLog<AuditRunEvent['event']>;
}

const audits = new Map<string, AuditEntry>();

function isoSafeTimestamp(): string {
  // Filesystem-safe ISO: replace ':' with '-'
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function auditRunsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'audit');
}

// ─── Setup helpers ──────────────────────────────────────────────────────────

function prepareWorkdir(skillDir: string, skillName: string, runId: string): string {
  if (!existsSync(skillDir)) {
    throw new Error(
      `Skill directory not found: ${skillDir}. If this is a Nakiros bundled skill, restart the daemon to re-sync ~/.nakiros/skills.`,
    );
  }

  // Persistent workdir: survives daemon restart so we can rehydrate in-flight
  // audits. Cleanup happens on Terminer / stop / failure.
  const runsRoot = auditRunsRoot();
  mkdirSync(runsRoot, { recursive: true });
  const workdir = join(runsRoot, runId);
  mkdirSync(workdir, { recursive: true });
  mkdirSync(join(workdir, 'outputs'), { recursive: true });

  const claudeDir = join(workdir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'settings.local.json'),
    JSON.stringify(
      {
        permissions: {
          defaultMode: 'acceptEdits',
          allow: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  // Symlink the skill being audited so /nakiros-skill-factory can find it via cwd
  const skillsDir = join(claudeDir, 'skills');
  mkdirSync(skillsDir, { recursive: true });
  const linkPath = join(skillsDir, skillName);
  if (!existsSync(linkPath)) {
    symlinkSync(realpathSync(skillDir), linkPath, 'dir');
  }

  return workdir;
}

function cleanupWorkdir(workdir: string): void {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  // Every `claude` run registered this workdir as a project in
  // `~/.claude/projects/`; drop that entry too so the user's project list
  // doesn't accumulate a row per audit.
  deleteClaudeProjectEntry(workdir);
}

function writeRunJson(entry: AuditEntry): void {
  persistRunJson(entry.run.workdir, {
    ...entry.run,
    _skillDir: entry.skillDir,
  });
}

// ─── Boot recovery ──────────────────────────────────────────────────────────

/**
 * Scan `~/.nakiros/runs/audit/*` on daemon boot. For each persisted workdir:
 *  - terminal runs (stopped/failed) → delete workdir (user didn't Terminer them).
 *  - completed runs → rehydrate so user can still Terminer from the UI.
 *  - in-flight (starting/running/waiting_for_input) → rehydrate with status
 *    collapsed appropriately (the subprocess is gone; waiting_for_input is
 *    recoverable via --resume, starting/running collapses to stopped if we
 *    can't continue).
 */
export function restoreOrCleanupAuditWorkdirs(): void {
  const root = auditRunsRoot();
  if (!existsSync(root)) return;

  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return;
  }

  for (const name of dirs) {
    const workdir = join(root, name);
    const blob = loadRunJson<AuditRun & { _skillDir?: string }>(workdir);
    if (!blob || !blob.runId || !blob._skillDir) {
      cleanupWorkdir(workdir);
      continue;
    }

    // Stopped/failed are genuinely disposable.
    if (blob.status === 'stopped' || blob.status === 'failed') {
      cleanupWorkdir(workdir);
      continue;
    }

    // Running/starting with no sessionId → can't resume meaningfully; drop.
    if ((blob.status === 'starting' || blob.status === 'running') && !blob.sessionId) {
      cleanupWorkdir(workdir);
      continue;
    }

    // Collapse running/starting to waiting_for_input (child is dead, but --resume works).
    const restoredStatus: AuditRun['status'] =
      blob.status === 'starting' || blob.status === 'running'
        ? 'waiting_for_input'
        : blob.status;

    const restoredRun: AuditRun = {
      runId: blob.runId,
      scope: blob.scope,
      projectId: blob.projectId,
      skillName: blob.skillName,
      status: restoredStatus,
      sessionId: blob.sessionId ?? null,
      workdir,
      reportPath: blob.reportPath ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt: blob.finishedAt ?? null,
      error: blob.error ?? null,
    };

    const entry: AuditEntry = {
      run: restoredRun,
      child: null,
      killed: false,
      skillDir: blob._skillDir,
      eventLog: new EventLog<AuditRunEvent['event']>({
        workdir,
        broadcast: () => { /* rebound on first incoming IPC call */ },
      }),
    };
    entry.eventLog.restore();
    audits.set(restoredRun.runId, entry);
    writeRunJson(entry);
    console.log(`[audit-runner] Restored audit ${restoredRun.runId} for "${restoredRun.skillName}" (status=${restoredStatus})`);
  }
}

// ─── Run lifecycle ──────────────────────────────────────────────────────────

interface RunOpts {
  skillDir: string;
  onEvent(event: AuditRunEvent): void;
}

/**
 * Re-point an existing entry's event log broadcast to the current caller.
 * Preserves the in-memory replay buffer.
 */
function rebindEventLog(entry: AuditEntry, opts: RunOpts): void {
  const buffered = entry.eventLog.getBuffered();
  entry.eventLog = new EventLog<AuditRunEvent['event']>({
    workdir: entry.run.workdir,
    broadcast: (event) => opts.onEvent({ runId: entry.run.runId, event }),
  });
  for (const ev of buffered) {
    (entry.eventLog as unknown as { buffer: unknown[] }).buffer.push(ev);
  }
}

/** Return the active (non-terminal) audit run for a given skill, if any. */
function findActiveAuditForSkill(
  scope: StartAuditRequest['scope'],
  projectId: string | undefined,
  skillName: string,
): AuditEntry | null {
  for (const entry of audits.values()) {
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

/** List all active (non-terminal) audit runs. Used by the UI to surface "audit running" badges. */
export function listActiveAuditRuns(): AuditRun[] {
  const out: AuditRun[] = [];
  for (const entry of audits.values()) {
    const s = entry.run.status;
    if (s === 'starting' || s === 'running' || s === 'waiting_for_input') {
      out.push(entry.run);
    }
  }
  return out;
}

export function startAudit(request: StartAuditRequest, opts: RunOpts): AuditRun {
  const existing = findActiveAuditForSkill(request.scope, request.projectId, request.skillName);
  if (existing) {
    console.log(`[audit-runner] Resuming active audit ${existing.run.runId} for ${request.skillName} (status=${existing.run.status})`);
    rebindEventLog(existing, opts);
    return existing.run;
  }

  const runId = generateRunId('audit');
  const workdir = prepareWorkdir(opts.skillDir, request.skillName, runId);
  const run: AuditRun = {
    runId,
    scope: request.scope,
    projectId: request.projectId,
    skillName: request.skillName,
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

  const entry: AuditEntry = {
    run,
    child: null,
    killed: false,
    skillDir: opts.skillDir,
    eventLog: new EventLog<AuditRunEvent['event']>({
      workdir,
      broadcast: (event) => opts.onEvent({ runId: run.runId, event }),
    }),
  };
  audits.set(run.runId, entry);
  writeRunJson(entry);

  // Launch the first turn asynchronously
  const firstPrompt = `/${FACTORY_SKILL_NAME} audit ${request.skillName}`;
  void executeTurn(entry, firstPrompt, true).then(() => maybeFinalize(entry));

  return run;
}

async function executeTurn(
  entry: AuditEntry,
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
    writeRunJson(entry);
    entry.eventLog.emit({ type: 'done', exitCode: result.exitCode, error: result.error ?? undefined });
  }
}

/**
 * After a turn completes, check if the audit report was produced.
 * If yes, archive and complete. Otherwise, transition to waiting_for_input
 * so the user can answer the agent's questions.
 */
function maybeFinalize(entry: AuditEntry): void {
  const { run } = entry;
  if (run.status === 'failed' || run.status === 'stopped') return;

  const reportSrc = join(run.workdir, 'outputs', 'audit-report.md');
  if (existsSync(reportSrc)) {
    finalizeRun(entry);
    return;
  }

  run.status = 'waiting_for_input';
  writeRunJson(entry);
  const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
  entry.eventLog.emit({ type: 'status', status: 'waiting_for_input' });
  entry.eventLog.emit({ type: 'waiting_for_input', lastAssistantText });
}

/**
 * Archive the audit report into `{skillDir}/audits/audit-{ISO}.md` and mark
 * the run as completed. Workdir and eventLog survive until the user clicks
 * Terminer — that way they can keep re-reading the conversation.
 */
function finalizeRun(entry: AuditEntry): void {
  const { run } = entry;
  const reportSrc = join(run.workdir, 'outputs', 'audit-report.md');
  if (!existsSync(reportSrc)) {
    run.status = 'failed';
    run.error = 'No audit-report.md was produced';
    run.finishedAt = new Date().toISOString();
    writeRunJson(entry);
    entry.eventLog.emit({ type: 'done', exitCode: 1, error: run.error });
    return;
  }

  const auditsDir = join(entry.skillDir, 'audits');
  mkdirSync(auditsDir, { recursive: true });
  const dest = join(auditsDir, `audit-${isoSafeTimestamp()}.md`);
  try {
    copyFileSync(reportSrc, dest);
    run.reportPath = dest;
  } catch (err) {
    run.status = 'failed';
    run.error = `Failed to archive report: ${(err as Error).message}`;
    run.finishedAt = new Date().toISOString();
    writeRunJson(entry);
    entry.eventLog.emit({ type: 'done', exitCode: 1, error: run.error });
    return;
  }

  run.status = 'completed';
  run.finishedAt = new Date().toISOString();
  writeRunJson(entry);
  entry.eventLog.emit({ type: 'status', status: 'completed' });
  entry.eventLog.emit({ type: 'done', exitCode: 0, reportPath: dest });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendAuditUserMessage(runId: string, message: string, opts: RunOpts): Promise<void> {
  const entry = audits.get(runId);
  if (!entry) throw new Error(`Audit run not found: ${runId}`);
  if (entry.run.status !== 'waiting_for_input') {
    throw new Error(`Audit run ${runId} is not waiting for input (status=${entry.run.status})`);
  }
  rebindEventLog(entry, opts);
  await executeTurn(entry, message, false);
  maybeFinalize(entry);
}

export function stopAudit(runId: string): void {
  const entry = audits.get(runId);
  if (!entry) return;
  entry.killed = true;
  entry.child?.kill('SIGTERM');
  if (entry.run.status !== 'completed' && entry.run.status !== 'failed') {
    entry.run.status = 'stopped';
    entry.run.finishedAt = new Date().toISOString();
  }
  // Broadcast BEFORE tearing down the log so the frontend gets immediate
  // feedback instead of waiting for the 500ms poll cycle.
  entry.eventLog.emit({ type: 'status', status: 'stopped' });
  entry.eventLog.emit({ type: 'done', exitCode: 130 });
  // Tear down the workdir (report, if any, was already archived to
  // {skillDir}/audits/). The entry stays in the registry so the UI can keep
  // rendering the stopped run until the user navigates away.
  entry.eventLog.destroy();
  cleanupWorkdir(entry.run.workdir);
}

/**
 * User-acknowledged completion ("Terminer" button). The archived audit-report.md
 * in `{skillDir}/audits/` is kept; the workdir (conversation + events) is deleted.
 */
export function finishAudit(runId: string): void {
  const entry = audits.get(runId);
  if (!entry) return;
  entry.eventLog.destroy();
  cleanupWorkdir(entry.run.workdir);
  audits.delete(runId);
}

export function getAuditRun(runId: string): AuditRun | null {
  return audits.get(runId)?.run ?? null;
}

/**
 * Return the buffered stream events for the current (in-flight) turn. Used by
 * the frontend when remounting AuditView mid-run so the live activity panel
 * re-populates instead of appearing empty.
 */
export function getAuditBufferedEvents(runId: string): AuditRunEvent['event'][] {
  return audits.get(runId)?.eventLog.getBuffered() ?? [];
}

/**
 * List archived audit reports for a given skill, newest first.
 */
export function listAuditHistory(skillDir: string): AuditHistoryEntry[] {
  const auditsDir = join(skillDir, 'audits');
  if (!existsSync(auditsDir)) return [];
  let files: string[];
  try {
    files = readdirSync(auditsDir).filter((f) => f.startsWith('audit-') && f.endsWith('.md'));
  } catch {
    return [];
  }

  const result: AuditHistoryEntry[] = files.map((fileName) => {
    const path = join(auditsDir, fileName);
    let sizeBytes = 0;
    let timestamp = '';
    try {
      const stat = statSync(path);
      sizeBytes = stat.size;
      // Try to parse the ISO timestamp from filename: audit-YYYY-MM-DDTHH-MM-SS.md
      const m = basename(fileName).match(/^audit-(.+)\.md$/);
      if (m) {
        const isoLike = m[1].replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4');
        timestamp = new Date(isoLike).toISOString();
      } else {
        timestamp = stat.mtime.toISOString();
      }
    } catch {
      // ignore
    }
    return { fileName, path, timestamp, sizeBytes };
  });

  result.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return result;
}

export function readAuditReport(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
