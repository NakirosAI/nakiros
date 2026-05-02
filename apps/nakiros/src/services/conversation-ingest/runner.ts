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

/**
 * Extract the real `cwd` from the first JSONL line that carries it. Claude
 * Code records the working directory verbatim on every entry; using that is
 * the only reliable way to recover the project path because the encoded
 * folder name under `~/.claude/projects/<encoded>` collapses both `/` and
 * `.` to `-`.
 */
function readCwdFromTranscript(transcriptPath: string): string {
  try {
    const raw = readFileSync(transcriptPath, 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as { cwd?: unknown };
        if (typeof entry.cwd === 'string' && entry.cwd.length > 0) return entry.cwd;
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // ignore
  }
  return '';
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

  // Resolve the real project path. Prefer the JSONL-recorded value; fall back
  // to the caller hint (from the queue payload) for empty transcripts.
  const recordedCwd = readCwdFromTranscript(transcriptPath);
  const projectPath = recordedCwd || cwdHint;
  if (!projectPath) {
    return { sessionId, ok: false, reason: 'project-path-unresolved' };
  }

  const kind = classifySessionKind(projectPath);
  const startedAt = messages[0]?.timestamp || isoFromStat(transcriptPath, 'birth');
  const lastTurnAt =
    messages[messages.length - 1]?.timestamp || isoFromStat(transcriptPath, 'mtime');
  const ingestedAt = new Date().toISOString();

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
    ingestedAt,
    turnCount: messages.length,
    startedAt,
    lastTurnAt,
    kind,
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
    if (indexed && indexed.lastTurnAt === file.mtimeIso) {
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

export { aggregateStats };
