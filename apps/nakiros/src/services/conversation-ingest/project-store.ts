import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import type {
  ConversationIngestProject,
  ConversationIngestSession,
  ConversationIngestSessionKind,
  ConversationMessage,
  ProjectConversation,
} from '@nakiros/shared';

import {
  encodeProjectDirName,
  getIngestIndexPath,
  getIngestLegacyManifestPath,
  getIngestLegacySessionsDir,
  getIngestProjectsDir,
  getProjectDir,
} from './paths.js';

/**
 * Project-keyed manifest. Each project entry holds its own session index
 * (kept inline because it stays small — a few hundred sessions even for the
 * most active project). Per-session message bodies live alongside in
 * `projects/<encoded>/sessions/<sid>.json` and are loaded lazily.
 */
export interface IngestIndex {
  /** Schema version — bumped when shape changes. V1 was a flat manifest.json. */
  version: 2;
  /** Keyed by absolute `projectPath` for O(1) lookups during scan. */
  projects: Record<string, IngestProjectEntry>;
}

export interface IngestProjectEntry {
  projectPath: string;
  encodedDir: string;
  /** Per-session metadata, keyed by sessionId. */
  sessions: Record<string, ConversationIngestSession>;
}

const EMPTY_INDEX: IngestIndex = { version: 2, projects: {} };

export function readIndex(): IngestIndex {
  const path = getIngestIndexPath();
  if (!existsSync(path)) return { ...EMPTY_INDEX, projects: {} };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { ...EMPTY_INDEX, projects: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<IngestIndex>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 2) {
      return { ...EMPTY_INDEX, projects: {} };
    }
    return {
      version: 2,
      projects:
        parsed.projects && typeof parsed.projects === 'object'
          ? (parsed.projects as Record<string, IngestProjectEntry>)
          : {},
    };
  } catch {
    return { ...EMPTY_INDEX, projects: {} };
  }
}

function writeIndex(index: IngestIndex): void {
  const path = getIngestIndexPath();
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

/**
 * Insert or update a session entry. Routes to the project sub-tree keyed by
 * `session.projectPath`, creating the project entry on first sight. Returns
 * the updated index so callers can broadcast aggregate stats without a
 * follow-up read.
 */
export function upsertSession(session: ConversationIngestSession): IngestIndex {
  const index = readIndex();
  let project = index.projects[session.projectPath];
  if (!project) {
    project = {
      projectPath: session.projectPath,
      encodedDir: encodeProjectDirName(session.projectPath),
      sessions: {},
    };
    index.projects[session.projectPath] = project;
  }
  project.sessions[session.sessionId] = session;
  writeIndex(index);
  return index;
}

function projectEntryView(entry: IngestProjectEntry): ConversationIngestProject {
  const sessions = Object.values(entry.sessions);
  let totalTurns = 0;
  let firstTurnAt = '';
  let lastTurnAt = '';
  let lastIngestAt = '';
  let userCount = 0;
  for (const s of sessions) {
    totalTurns += s.turnCount;
    if (!firstTurnAt || s.startedAt < firstTurnAt) firstTurnAt = s.startedAt;
    if (!lastTurnAt || s.lastTurnAt > lastTurnAt) lastTurnAt = s.lastTurnAt;
    if (!lastIngestAt || s.ingestedAt > lastIngestAt) lastIngestAt = s.ingestedAt;
    if (s.kind === 'user') userCount++;
  }
  // A project is `user` if at least one of its sessions is. A project where
  // every session is synthetic is `synthetic` (sandbox / nakiros-internal).
  const kind: ConversationIngestSessionKind = userCount > 0 ? 'user' : 'synthetic';
  return {
    projectPath: entry.projectPath,
    encodedDir: entry.encodedDir,
    displayName: basename(entry.projectPath) || entry.projectPath,
    kind,
    totalSessions: sessions.length,
    totalTurns,
    firstTurnAt,
    lastTurnAt,
    lastIngestAt,
  };
}

/** Project list, sorted by most-recent activity, with computed aggregates. */
export function listProjects(): ConversationIngestProject[] {
  const index = readIndex();
  return Object.values(index.projects)
    .map(projectEntryView)
    .sort((a, b) => (b.lastTurnAt > a.lastTurnAt ? 1 : b.lastTurnAt < a.lastTurnAt ? -1 : 0));
}

/** Sessions for a single project, sorted by most-recent activity. */
export function listSessionsForProject(projectPath: string): ConversationIngestSession[] {
  const index = readIndex();
  const project = index.projects[projectPath];
  if (!project) return [];
  return Object.values(project.sessions).sort((a, b) =>
    b.lastTurnAt > a.lastTurnAt ? 1 : b.lastTurnAt < a.lastTurnAt ? -1 : 0,
  );
}

/** Flat list across every project — used by diagnostics + the legacy `listSessions` IPC. */
export function listAllSessions(): ConversationIngestSession[] {
  const index = readIndex();
  const all: ConversationIngestSession[] = [];
  for (const project of Object.values(index.projects)) {
    for (const session of Object.values(project.sessions)) all.push(session);
  }
  all.sort((a, b) => (b.lastTurnAt > a.lastTurnAt ? 1 : b.lastTurnAt < a.lastTurnAt ? -1 : 0));
  return all;
}

export interface IngestAggregateStats {
  /** Total user-kind projects (excludes synthetic-only projects). */
  totalProjects: number;
  /** Total user-kind sessions across all projects. */
  totalUserSessions: number;
  /** Total session count across every kind — for diagnostics only. */
  totalSessions: number;
  /** Sum of `turnCount` across user-kind sessions. */
  totalTurns: number;
  lastIngestAt: string | null;
}

export function aggregateStats(): IngestAggregateStats {
  const index = readIndex();
  let totalProjects = 0;
  let totalUserSessions = 0;
  let totalSessions = 0;
  let totalTurns = 0;
  let lastIngestAt: string | null = null;
  for (const project of Object.values(index.projects)) {
    const sessions = Object.values(project.sessions);
    let userInProject = 0;
    for (const s of sessions) {
      totalSessions++;
      if (s.kind === 'user') {
        totalUserSessions++;
        totalTurns += s.turnCount;
        userInProject++;
      }
      if (!lastIngestAt || s.ingestedAt > lastIngestAt) lastIngestAt = s.ingestedAt;
    }
    if (userInProject > 0) totalProjects++;
  }
  return { totalProjects, totalUserSessions, totalSessions, totalTurns, lastIngestAt };
}

/**
 * One-shot migration from the V1 flat layout (`manifest.json` + `sessions/*.json`)
 * to the V2 per-project layout. Idempotent: subsequent boots are no-ops once
 * the legacy artefacts are gone. We don't try to re-key the V1 sessions —
 * the next `runNow` / hook tick will repopulate them in the new layout
 * (cheap, since the source is `~/.claude/projects/`).
 */
export function migrateLegacyV1IfPresent(): { migrated: boolean } {
  const legacyManifest = getIngestLegacyManifestPath();
  const legacySessions = getIngestLegacySessionsDir();
  let migrated = false;
  if (existsSync(legacyManifest)) {
    try {
      rmSync(legacyManifest, { force: true });
      migrated = true;
    } catch {
      // ignore — caller can retry later
    }
  }
  if (existsSync(legacySessions)) {
    try {
      rmSync(legacySessions, { recursive: true, force: true });
      migrated = true;
    } catch {
      // ignore
    }
  }
  return { migrated };
}

/**
 * Wipe every persisted project + the index + every per-project sessions/
 * folder. Leaves the queue alone so any un-processed Stop-hook payloads will
 * still be drained on the next run.
 */
export function purgeIngestData(): void {
  const projectsDir = getIngestProjectsDir();
  try {
    rmSync(projectsDir, { recursive: true, force: true });
  } catch {
    // Non-fatal — index reset below is enough to make the UI count zero.
  }
  // Recreate empty projects dir so the runner can write into it.
  mkdirSync(projectsDir, { recursive: true });
  writeIndex({ version: 2, projects: {} });
}

/** Absolute path of the body file for a session. */
export function sessionBodyPath(session: ConversationIngestSession): string {
  return `${getProjectDir(session.projectPath)}/sessions/${session.sessionId}.json`;
}

interface SessionBody {
  sessionId: string;
  projectPath: string;
  transcriptPath: string;
  ingestedAt: string;
  kind: ConversationIngestSessionKind;
  messages: ConversationMessage[];
}

/**
 * Read the parsed messages for a session. Returns `null` when the session is
 * not yet indexed — callers should run `ensureProjectIndexed` first if a
 * fresh ingest is desired before reading.
 */
export function readSessionBody(projectPath: string, sessionId: string): SessionBody | null {
  const path = join(getProjectDir(projectPath), 'sessions', `${sessionId}.json`);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SessionBody>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) return null;
    return parsed as SessionBody;
  } catch {
    return null;
  }
}

/**
 * Map an ingest-store session entry to the legacy `ProjectConversation` shape
 * the project handlers expose to the UI. Centralised here so any field added
 * to {@link ConversationIngestSession} that lifts up to the UI gets routed
 * through one place.
 */
export function toProjectConversation(
  session: ConversationIngestSession,
  projectId: string,
): ProjectConversation {
  return {
    sessionId: session.sessionId,
    projectId,
    startedAt: session.startedAt,
    lastMessageAt: session.lastTurnAt,
    messageCount: session.turnCount,
    toolsUsed: session.toolsUsed,
    gitBranch: session.gitBranch,
    cwd: session.projectPath,
    claudeVersion: session.claudeVersion,
    summary: session.summary || '(no summary)',
    kind: session.kind,
  };
}
