import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

import type {
  ConversationIngestProgressEvent,
  ConversationIngestSession,
  ConversationMessage,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { eventBus } from '../../daemon/event-bus.js';
import { getConversationMessages } from '../conversation-parser.js';
import {
  classifySessionKind,
  getIngestQueueDir,
  getProjectSessionsDir,
} from './paths.js';
import {
  aggregateStats,
  migrateLegacyV1IfPresent,
  readIndex,
  upsertSession,
} from './project-store.js';

/**
 * Drains the ingest queue and full-scans `~/.claude/projects/`. Reuses the
 * existing {@link getConversationMessages} parser so we don't fork JSONL
 * parsing logic. Per-session bodies are persisted to
 * `~/.nakiros/ingest/projects/<encoded>/sessions/<sessionId>.json` and the
 * top-level index is updated atomically per session — partial failures don't
 * corrupt prior state.
 */

interface QueueEntry {
  ts: number;
  payload: {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    hook_event_name?: string;
  };
}

function broadcastProgress(event: ConversationIngestProgressEvent): void {
  eventBus.broadcast(IPC_CHANNELS['conversationIngest:progress'], event);
}

function readQueue(): { path: string; entry: QueueEntry }[] {
  const dir = getIngestQueueDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  files.sort();
  const out: { path: string; entry: QueueEntry }[] = [];
  for (const f of files) {
    const path = join(dir, f);
    try {
      const raw = readFileSync(path, 'utf8');
      const entry = JSON.parse(raw) as QueueEntry;
      if (!entry || typeof entry !== 'object' || !entry.payload) continue;
      out.push({ path, entry });
    } catch {
      // Skip and let it sit in queue/ — the user can manually rm if needed.
    }
  }
  return out;
}

export function getQueueLength(): number {
  const dir = getIngestQueueDir();
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/**
 * Resolve the session id + transcript path from a queue entry. The hook
 * gives us `transcript_path` directly when invoked by Claude Code ≥ 1.x.
 */
function resolveTranscript(entry: QueueEntry): { sessionId: string; transcriptPath: string; cwd: string } | null {
  const sessionId = entry.payload.session_id;
  if (!sessionId) return null;
  const direct = entry.payload.transcript_path;
  if (direct && existsSync(direct)) {
    return { sessionId, transcriptPath: direct, cwd: entry.payload.cwd ?? '' };
  }
  // Forward-direction encoding (cwd → encoded dir name) is unambiguous.
  const cwd = entry.payload.cwd;
  if (!cwd) return null;
  const encoded = cwd.replace(/[/\\:]/g, '-');
  const guess = join(homedir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`);
  if (existsSync(guess)) return { sessionId, transcriptPath: guess, cwd };
  return null;
}

interface IngestOutcome {
  sessionId: string;
  ok: boolean;
  reason?: string;
}

interface RawSessionMeta {
  cwd: string;
  gitBranch: string | null;
  claudeVersion: string | null;
}

/**
 * Extract `cwd`, `gitBranch`, and `version` from the JSONL header lines —
 * Claude Code records them on every entry. We stop as soon as the three
 * non-null values have been seen so empty / large transcripts don't pay the
 * full walk cost.
 *
 * The `cwd` value here is the only reliable way to recover the project path:
 * the encoded folder name under `~/.claude/projects/<encoded>/` collapses
 * both `/` and `.` to `-`, so reversing it would be ambiguous.
 */
function readMetaFromTranscript(transcriptPath: string): RawSessionMeta {
  const meta: RawSessionMeta = { cwd: '', gitBranch: null, claudeVersion: null };
  try {
    const raw = readFileSync(transcriptPath, 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as Record<string, unknown>;
        if (!meta.cwd && typeof entry.cwd === 'string' && entry.cwd.length > 0) {
          meta.cwd = entry.cwd;
        }
        if (meta.gitBranch === null && typeof entry.gitBranch === 'string' && entry.gitBranch.length > 0) {
          meta.gitBranch = entry.gitBranch;
        }
        if (meta.claudeVersion === null && typeof entry.version === 'string' && entry.version.length > 0) {
          meta.claudeVersion = entry.version;
        }
        if (meta.cwd && meta.gitBranch && meta.claudeVersion) break;
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // ignore
  }
  return meta;
}

/**
 * Build the `summary` (first user-message text, truncated) and `toolsUsed`
 * (de-duplicated set of tool names) from already-parsed messages — no extra
 * file IO. Mirrors the legacy `services/conversation-parser.ts:listConversations`
 * heuristics for parity.
 */
function buildSessionSummaryAndTools(messages: ConversationMessage[]): {
  summary: string;
  toolsUsed: string[];
} {
  let summary = '';
  const tools = new Set<string>();
  for (const msg of messages) {
    if (msg.type === 'user' && !summary && msg.content) {
      // Skip slash-command / local-command wrappers — they're noise as a list label.
      if (!msg.content.includes('<command-name>') && !msg.content.includes('<local-command-')) {
        summary = msg.content.slice(0, 200);
      }
    }
    if (msg.toolUse && msg.toolUse.length > 0) {
      for (const t of msg.toolUse) tools.add(t.name);
    }
  }
  return { summary, toolsUsed: Array.from(tools) };
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

function isoFromStat(path: string, kind: 'birth' | 'mtime'): string {
  try {
    const s = statSync(path);
    return (kind === 'birth' ? s.birthtime : s.mtime).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Parse a single Claude Code session JSONL and persist its turns under
 * `projects/<encoded>/sessions/<sessionId>.json`, updating the index.
 * Idempotent — re-ingesting the same transcript overwrites prior state.
 */
export function ingestSession(sessionId: string, transcriptPath: string, cwdHint: string): IngestOutcome {
  if (!existsSync(transcriptPath)) {
    return { sessionId, ok: false, reason: 'transcript-missing' };
  }

  const providerProjectDir = dirname(transcriptPath);
  let messages: ConversationMessage[];
  try {
    messages = getConversationMessages(providerProjectDir, sessionId);
  } catch (err) {
    return { sessionId, ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  // Resolve project path + raw header metadata in a single transcript pass.
  const rawMeta = readMetaFromTranscript(transcriptPath);
  const projectPath = rawMeta.cwd || cwdHint;
  if (!projectPath) {
    return { sessionId, ok: false, reason: 'project-path-unresolved' };
  }

  const kind = classifySessionKind(projectPath);
  const transcriptMtime = isoFromStat(transcriptPath, 'mtime');
  const startedAt = messages[0]?.timestamp || isoFromStat(transcriptPath, 'birth');
  const lastTurnAt = messages[messages.length - 1]?.timestamp || transcriptMtime;
  const ingestedAt = new Date().toISOString();
  const { summary, toolsUsed } = buildSessionSummaryAndTools(messages);

  // Persist parsed body — overwrite on re-ingest.
  const sessionFile = join(getProjectSessionsDir(projectPath), `${sessionId}.json`);
  const body = {
    sessionId,
    projectPath,
    transcriptPath,
    ingestedAt,
    kind,
    messages,
  };
  try {
    writeAtomic(sessionFile, JSON.stringify(body, null, 2) + '\n');
  } catch (err) {
    return { sessionId, ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const meta: ConversationIngestSession = {
    sessionId,
    projectPath,
    transcriptPath,
    transcriptMtime,
    ingestedAt,
    turnCount: messages.length,
    startedAt,
    lastTurnAt,
    kind,
    gitBranch: rawMeta.gitBranch,
    claudeVersion: rawMeta.claudeVersion,
    summary,
    toolsUsed,
  };
  upsertSession(meta);
  return { sessionId, ok: true };
}

/**
 * Drain every queue file currently on disk, ingesting each session. Files
 * are deleted after a successful ingest; a failure leaves the queue file in
 * place so the next run will retry.
 */
export function drainQueue(): void {
  // Always check for + run the V1 → V2 migration before draining. Cheap when
  // there's nothing to migrate (two `existsSync` checks).
  migrateLegacyV1IfPresent();

  const queue = readQueue();
  if (queue.length === 0) return;

  broadcastProgress({
    processed: 0,
    total: queue.length,
    currentSessionId: null,
    phase: 'ingesting',
  });

  let processed = 0;
  for (const { path, entry } of queue) {
    const resolved = resolveTranscript(entry);
    if (!resolved) {
      try {
        unlinkSync(path);
      } catch {
        // ignore
      }
      processed++;
      continue;
    }

    broadcastProgress({
      processed,
      total: queue.length,
      currentSessionId: resolved.sessionId,
      phase: 'ingesting',
    });

    const outcome = ingestSession(resolved.sessionId, resolved.transcriptPath, resolved.cwd);
    if (outcome.ok) {
      try {
        unlinkSync(path);
      } catch {
        // ignore — leftover queue file will be retried (and is idempotent)
      }
    }
    processed++;
  }

  broadcastProgress({
    processed,
    total: queue.length,
    currentSessionId: null,
    phase: 'done',
  });
}

/**
 * Walk every `.jsonl` under `~/.claude/projects/` and ingest each one. Skips
 * sessions already indexed at the same `lastTurnAt` mtime. Used by the
 * "Run scan now" UI button + the initial backfill on first opt-in.
 */
export function fullScan(): { scanned: number; ingested: number; skipped: number } {
  migrateLegacyV1IfPresent();

  const projectsRoot = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsRoot)) {
    broadcastProgress({ processed: 0, total: 0, currentSessionId: null, phase: 'done' });
    return { scanned: 0, ingested: 0, skipped: 0 };
  }

  const allFiles: { sessionId: string; path: string; mtimeIso: string }[] = [];
  let entries: string[];
  try {
    entries = readdirSync(projectsRoot);
  } catch {
    return { scanned: 0, ingested: 0, skipped: 0 };
  }
  for (const entry of entries) {
    const dir = join(projectsRoot, entry);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    // We don't try to decode the encoded directory name back to a cwd —
    // `ingestSession` reads the real cwd from the JSONL itself.
    for (const f of files) {
      const sessionId = f.replace(/\.jsonl$/, '');
      const path = join(dir, f);
      let mtimeIso = '';
      try {
        mtimeIso = statSync(path).mtime.toISOString();
      } catch {
        continue;
      }
      allFiles.push({ sessionId, path, mtimeIso });
    }
  }

  broadcastProgress({
    processed: 0,
    total: allFiles.length,
    currentSessionId: null,
    phase: 'scanning',
  });

  // Build a sessionId → existing entry map so we can skip up-to-date ones.
  // The index is keyed by projectPath, so we flatten on read.
  const index = readIndex();
  const indexBySessionId = new Map<string, ConversationIngestSession>();
  for (const project of Object.values(index.projects)) {
    for (const session of Object.values(project.sessions)) {
      indexBySessionId.set(session.sessionId, session);
    }
  }

  let ingested = 0;
  let skipped = 0;
  let processed = 0;
  for (const file of allFiles) {
    const indexed = indexBySessionId.get(file.sessionId);
    if (indexed && indexed.transcriptMtime === file.mtimeIso) {
      skipped++;
      processed++;
      continue;
    }
    broadcastProgress({
      processed,
      total: allFiles.length,
      currentSessionId: file.sessionId,
      phase: 'ingesting',
    });
    const outcome = ingestSession(file.sessionId, file.path, '');
    if (outcome.ok) ingested++;
    processed++;
  }

  broadcastProgress({
    processed,
    total: allFiles.length,
    currentSessionId: null,
    phase: 'done',
  });
  return { scanned: allFiles.length, ingested, skipped };
}

/**
 * Lazy per-project indexer: scan a single project's `~/.claude/projects/<encoded>/`
 * folder, ingest sessions that are missing or stale, and skip the rest.
 * Called by the project handlers on every read so the ingest store stays
 * fresh without requiring the user to opt in to the Stop hook. Cheap when
 * everything is up-to-date (one `readdirSync` + N `statSync` calls).
 */
export function ensureProjectIndexed(
  providerProjectDir: string,
): { ingested: number; total: number } {
  if (!existsSync(providerProjectDir)) return { ingested: 0, total: 0 };

  let files: string[];
  try {
    files = readdirSync(providerProjectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return { ingested: 0, total: 0 };
  }

  // Build a sessionId → indexed entry map across the whole index. We can't
  // narrow by projectPath here because we don't yet know which project the
  // sessions belong to (the path encoding is one-way).
  const index = readIndex();
  const indexBySessionId = new Map<string, ConversationIngestSession>();
  for (const project of Object.values(index.projects)) {
    for (const session of Object.values(project.sessions)) {
      indexBySessionId.set(session.sessionId, session);
    }
  }

  let ingested = 0;
  for (const f of files) {
    const sessionId = f.replace(/\.jsonl$/, '');
    const path = join(providerProjectDir, f);
    let mtimeIso: string;
    try {
      mtimeIso = statSync(path).mtime.toISOString();
    } catch {
      continue;
    }
    const indexed = indexBySessionId.get(sessionId);
    if (indexed && indexed.transcriptMtime === mtimeIso) continue;
    const outcome = ingestSession(sessionId, path, '');
    if (outcome.ok) ingested++;
  }
  return { ingested, total: files.length };
}

export { aggregateStats };
