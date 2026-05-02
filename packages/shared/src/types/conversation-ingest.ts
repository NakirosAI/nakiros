/**
 * Types for the conversation-ingest module — opt-in pipeline that captures
 * Claude Code session JSONL files (via a `Stop` hook + chokidar watcher) and
 * persists parsed turns under `~/.nakiros/ingest/`. V1.0 stores raw turns;
 * later versions add classification + embedding clustering.
 *
 * V2 layout (per-project): each project gets its own subdir under
 * `projects/<encoded>/sessions/`. The top-level `index.json` indexes every
 * project so the UI can render a project list without globbing.
 */

/** Tags a session as either real user activity or a Nakiros-internal sandbox run. */
export type ConversationIngestSessionKind = 'user' | 'synthetic';

export interface ConversationIngestStatus {
  /** Hook installed AND queue watcher running. The end-user-facing toggle. */
  enabled: boolean;
  /** Whether the Stop hook command is currently present in `~/.claude/settings.json`. */
  hookInstalled: boolean;
  /** Absolute path of the hook script Nakiros writes when enabling ingest. */
  hookScriptPath: string;
  /** Absolute path of the user-global Claude settings file the hook is registered in. */
  settingsPath: string;
  /** Number of distinct **user** projects currently indexed. Synthetic ones are not counted. */
  totalProjects: number;
  /** Sum of `turnCount` across every **user** session. */
  totalTurns: number;
  /** Total session count across all kinds (user + synthetic) — used for diagnostics. */
  totalSessions: number;
  /** ISO timestamp of the most recent successful session ingest, or `null` when empty. */
  lastIngestAt: string | null;
  /** Number of un-processed queue files sitting under `~/.nakiros/ingest/queue/`. */
  queueLength: number;
}

/**
 * Diff payload returned to the UI before the user opts in. Lets us show the
 * exact JSON change we're about to write to `~/.claude/settings.json` so the
 * user can audit the mutation.
 */
export interface ConversationIngestHookDiff {
  /** Absolute path of the user-global settings file we will mutate. */
  settingsPath: string;
  /** Whether `settings.json` currently exists on disk. */
  exists: boolean;
  /** Current settings.json content (empty string when `exists === false`). */
  current: string;
  /** Settings.json content after enabling — what `enable()` will write. */
  next: string;
  /** Path of the hook script that will be installed alongside the settings change. */
  hookScriptPath: string;
}

/** Per-session metadata persisted in the index and exposed to the UI. */
export interface ConversationIngestSession {
  sessionId: string;
  /** `cwd` recorded in the JSONL — the project root. */
  projectPath: string;
  /** Absolute path of the source `.jsonl` under `~/.claude/projects/<encoded>/`. */
  transcriptPath: string;
  /**
   * ISO mtime of the source `.jsonl` at ingest time. Used by
   * `ensureProjectIndexed` to skip sessions whose source has not changed
   * since the last ingest pass — `lastTurnAt` (a message timestamp) does
   * not match the file mtime, so we track them separately.
   */
  transcriptMtime: string;
  /** ISO timestamp of when Nakiros parsed and stored this session. */
  ingestedAt: string;
  /** Total user/assistant/system turns parsed (post `conversation-parser` filtering). */
  turnCount: number;
  /** ISO timestamp of the first turn in the session. */
  startedAt: string;
  /** ISO timestamp of the last turn in the session. */
  lastTurnAt: string;
  /** Classification: real user activity vs Nakiros-internal sandbox run. */
  kind: ConversationIngestSessionKind;
  /** Git branch recorded in the JSONL `gitBranch` field, or null when absent. */
  gitBranch: string | null;
  /** Claude Code `version` recorded in the JSONL, or null when absent. */
  claudeVersion: string | null;
  /** First user-message text (≤ 200 chars), used as a quick descriptor in lists. */
  summary: string;
  /** Distinct tool names invoked across the session (de-duplicated). */
  toolsUsed: string[];
}

/**
 * Aggregate view of one project's ingested sessions. Computed from the
 * underlying session entries — never persisted independently, so it stays in
 * sync as sessions are added/updated.
 */
export interface ConversationIngestProject {
  /** Original cwd the project corresponds to. */
  projectPath: string;
  /** `<basename>-<sha1[:8]>` directory name under `projects/`. Stable across rescans. */
  encodedDir: string;
  /** Last path segment of `projectPath`, used for display. */
  displayName: string;
  /** Whether every session in this project is synthetic (sandbox / nakiros-internal). */
  kind: ConversationIngestSessionKind;
  totalSessions: number;
  totalTurns: number;
  /** ISO timestamp of the earliest session in the project. */
  firstTurnAt: string;
  /** ISO timestamp of the latest session in the project. */
  lastTurnAt: string;
  /** ISO timestamp of the most recent ingest pass that touched this project. */
  lastIngestAt: string;
}

/** Live event broadcast on `conversationIngest:progress` while the runner drains the queue. */
export interface ConversationIngestProgressEvent {
  processed: number;
  total: number;
  currentSessionId: string | null;
  phase: 'idle' | 'scanning' | 'ingesting' | 'done' | 'error';
  error?: string;
}

/** Discriminated result for handlers that mutate state (enable / disable / purge / runNow). */
export type ConversationIngestMutationResult =
  | { ok: true; status: ConversationIngestStatus }
  | { ok: false; code: ConversationIngestErrorCode; message: string };

export type ConversationIngestErrorCode =
  | 'settings-write-failed'
  | 'hook-script-write-failed'
  | 'already-enabled'
  | 'not-enabled'
  | 'purge-failed'
  | 'scan-failed';
