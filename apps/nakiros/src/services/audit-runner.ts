import { spawn, type ChildProcess } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

import type {
  AuditHistoryEntry,
  AuditRun,
  AuditRunEvent,
  AuditRunStatus,
  AuditRunTurn,
  StartAuditRequest,
} from '@nakiros/shared';

const FACTORY_SKILL_NAME = 'nakiros-skill-factory';

interface AuditEntry {
  run: AuditRun;
  child: ChildProcess | null;
  killed: boolean;
}

const audits = new Map<string, AuditEntry>();
let counter = 0;

function generateRunId(): string {
  return `audit_${Date.now().toString(36)}_${(++counter).toString(36)}`;
}

function isoSafeTimestamp(): string {
  // Filesystem-safe ISO: replace ':' with '-'
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── Setup helpers ──────────────────────────────────────────────────────────

function prepareWorkdir(skillDir: string, skillName: string): string {
  const workdir = mkdtempSync(join(tmpdir(), 'nakiros-audit-'));
  mkdirSync(join(workdir, 'outputs'), { recursive: true });

  // Settings: bypass permissions for this scratch dir
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
  try {
    const linkPath = join(skillsDir, skillName);
    if (!existsSync(linkPath)) {
      // Use `ln -s` semantics via fs
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('fs').symlinkSync(skillDir, linkPath, 'dir');
    }
  } catch {
    // ignore — fallback would be copy but not critical for audits
  }

  return workdir;
}

function buildClaudeArgs(prompt: string, resumeSessionId?: string): string[] {
  const args: string[] = ['--output-format', 'stream-json', '--verbose'];
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  args.push('--print', prompt);
  return args;
}

function persistRunJson(run: AuditRun): void {
  // Ephemeral persistence inside the workdir for crash recovery / debugging
  try {
    writeFileSync(join(run.workdir, 'run.json'), JSON.stringify(run, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

// ─── Stream parsing ─────────────────────────────────────────────────────────

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
  // Resume an in-flight audit for the same skill instead of starting a duplicate.
  const existing = findActiveAuditForSkill(request.scope, request.projectId, request.skillName);
  if (existing) {
    console.log(`[audit-runner] Resuming active audit ${existing.run.runId} for ${request.skillName} (status=${existing.run.status})`);
    return existing.run;
  }

  const workdir = prepareWorkdir(opts.skillDir, request.skillName);
  const run: AuditRun = {
    runId: generateRunId(),
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

  const entry: AuditEntry = { run, child: null, killed: false };
  audits.set(run.runId, entry);
  persistRunJson(run);

  // Launch the first turn asynchronously
  const firstPrompt = `/${FACTORY_SKILL_NAME} audit ${request.skillName}`;
  void executeTurn(entry, firstPrompt, true, opts).then(() => maybeFinalize(entry, opts));

  return run;
}

async function executeTurn(
  entry: AuditEntry,
  userMessage: string,
  isFirstTurn: boolean,
  opts: RunOpts,
): Promise<void> {
  const { run } = entry;
  if (entry.killed) return;

  run.status = 'starting';
  persistRunJson(run);
  opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'starting' } });

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
    persistRunJson(run);
    opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'running' } });

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
              opts.onEvent({ runId: run.runId, event: { type: 'text', text } });
            },
            onTool: (name, display) => {
              tools.push({ name, display });
              opts.onEvent({ runId: run.runId, event: { type: 'tool', name, display } });
            },
            onUsage: (tokens) => {
              run.tokensUsed += tokens;
              opts.onEvent({ runId: run.runId, event: { type: 'tokens', tokensUsed: run.tokensUsed } });
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
    persistRunJson(run);
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode, error: errorMessage ?? undefined } });
  }
}

/**
 * After a turn completes, check if the audit report was produced.
 * If yes, archive and complete. Otherwise, transition to waiting_for_input
 * so the user can answer the agent's questions.
 */
function maybeFinalize(entry: AuditEntry, opts: RunOpts): void {
  const { run } = entry;
  if (run.status === 'failed' || run.status === 'stopped') return;

  const reportSrc = join(run.workdir, 'outputs', 'audit-report.md');
  if (existsSync(reportSrc)) {
    finalizeRun(entry, opts);
    return;
  }

  // No report yet → expect more interaction
  run.status = 'waiting_for_input';
  persistRunJson(run);
  const lastAssistantText = run.turns[run.turns.length - 1]?.content ?? '';
  opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'waiting_for_input' } });
  opts.onEvent({ runId: run.runId, event: { type: 'waiting_for_input', lastAssistantText } });
}

function finalizeRun(entry: AuditEntry, opts: RunOpts): void {
  const { run } = entry;
  const reportSrc = join(run.workdir, 'outputs', 'audit-report.md');
  if (!existsSync(reportSrc)) {
    run.status = 'failed';
    run.error = 'No audit-report.md was produced';
    run.finishedAt = new Date().toISOString();
    persistRunJson(run);
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
    return;
  }

  // Archive into {actualSkillDir}/audits/audit-{ISO}.md
  const skillDir = resolveActualSkillDir(run);
  if (!skillDir) {
    run.status = 'failed';
    run.error = 'Could not resolve skill directory to archive the audit';
    run.finishedAt = new Date().toISOString();
    persistRunJson(run);
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
    return;
  }

  const auditsDir = join(skillDir, 'audits');
  mkdirSync(auditsDir, { recursive: true });
  const dest = join(auditsDir, `audit-${isoSafeTimestamp()}.md`);
  try {
    copyFileSync(reportSrc, dest);
    run.reportPath = dest;
  } catch (err) {
    run.status = 'failed';
    run.error = `Failed to archive report: ${(err as Error).message}`;
    run.finishedAt = new Date().toISOString();
    persistRunJson(run);
    opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 1, error: run.error } });
    return;
  }

  run.status = 'completed';
  run.finishedAt = new Date().toISOString();
  persistRunJson(run);
  opts.onEvent({ runId: run.runId, event: { type: 'status', status: 'completed' } });
  opts.onEvent({ runId: run.runId, event: { type: 'done', exitCode: 0, reportPath: dest } });
}

/**
 * Best-effort resolution of the actual skill directory from the run.
 * For nakiros-bundled scope: resolved by the IPC handler; we store skillDir hint.
 */
function resolveActualSkillDir(_run: AuditRun): string | null {
  // We rely on the workdir's symlink target. Read it back.
  // Workdir has .claude/skills/{skillName} → real skill dir.
  const symlink = join(_run.workdir, '.claude', 'skills', _run.skillName);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realPath = require('fs').realpathSync(symlink);
    return realPath as string;
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendAuditUserMessage(runId: string, message: string, opts: RunOpts): Promise<void> {
  const entry = audits.get(runId);
  if (!entry) throw new Error(`Audit run not found: ${runId}`);
  if (entry.run.status !== 'waiting_for_input') {
    throw new Error(`Audit run ${runId} is not waiting for input (status=${entry.run.status})`);
  }
  await executeTurn(entry, message, false, opts);
  maybeFinalize(entry, opts);
}

export function stopAudit(runId: string): void {
  const entry = audits.get(runId);
  if (!entry) return;
  entry.killed = true;
  entry.child?.kill('SIGTERM');
  if (entry.run.status !== 'completed' && entry.run.status !== 'failed') {
    entry.run.status = 'stopped';
    entry.run.finishedAt = new Date().toISOString();
    persistRunJson(entry.run);
  }
}

export function getAuditRun(runId: string): AuditRun | null {
  return audits.get(runId)?.run ?? null;
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
        // Reverse the earlier replacement: '-' between H/M/S parts → ':'
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

import { readFileSync as fsReadFile } from 'fs';
export function readAuditReport(path: string): string | null {
  try {
    return fsReadFile(path, 'utf8');
  } catch {
    return null;
  }
}
