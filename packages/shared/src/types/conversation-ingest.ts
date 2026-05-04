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

// ---------------------------------------------------------------------------
// Conversation digest — V1.1 semantic classification produced by the
// `nakiros-conversation-classifier` skill (Haiku 4.5). Persisted under
// `~/.nakiros/ingest/projects/<encoded>/digests/<sid>.json` so future
// cross-conversation aggregation (V1.2 propose-engine) can read it without
// re-running the LLM.
// ---------------------------------------------------------------------------

/** Seven semantic friction kinds — see SKILL.md `references/friction-kinds.md`. */
export type ConversationFrictionKind =
  | 'miscomprehension'
  | 'rework'
  | 'user_takeover'
  | 'convention_violation'
  | 'scope_drift'
  | 'missing_documented_context'
  | 'wrong_abstraction_level';

/** Severity of a friction — drives downstream prioritization. */
export type ConversationFrictionSeverity = 'low' | 'med' | 'high';

/** Whether a rule is project-specific, cross-project, or non-generalizable. */
export type ConversationRuleScope = 'project' | 'global' | 'none';

/**
 * Best-guess routing target for a rule candidate. The V1.3 propose-engine
 * uses this to decide which `.claude/` editor to surface.
 */
export type ConversationRuleTargetModule =
  | 'rules'
  | 'claude_md'
  | 'subagent'
  | 'skill'
  | 'output_style';

/** Phase of the conversation as segmented by the classifier. */
export interface ConversationDigestPhase {
  /** Stable id within the digest, e.g. `p1`, `p2`. */
  id: string;
  /** Free-form snake_case label — `setup`, `implementation`, `debugging`, … */
  label: string;
  /** 1-indexed turn number where the phase begins (inclusive). */
  fromTurn: number;
  /** 1-indexed turn number where the phase ends (inclusive). */
  toTurn: number;
  /** One-sentence description of what the phase attempted (≤ 25 words). */
  summary: string;
}

/** A single semantic friction observed in the conversation. */
export interface ConversationDigestFriction {
  /** References a phase id from `phases[]`. */
  phaseId: string;
  kind: ConversationFrictionKind;
  severity: ConversationFrictionSeverity;
  /** 1-indexed turn numbers backing this friction (ascending). */
  evidenceTurns: number[];
  /** Factual narrative of what went wrong, in the conversation language. */
  whatHappened: string;
  /** Rule that would have prevented or shortened this friction. `null` if too situational. */
  ruleCandidate: string | null;
  scope: ConversationRuleScope;
  /** Confidence in `[0, 1]`. Below 0.5 the classifier is asked to drop the entry. */
  confidence: number;
}

/** A normalized rule extracted from one or more frictions in this session. */
export interface ConversationDigestRule {
  /** Short prescriptive sentence ("Place HTTP routes under routes/, not server.ts"). */
  rule: string;
  /** Why this rule helps — references the concrete behavior in this session. */
  why: string;
  /** Most representative phase id where this rule would have helped. */
  phaseId: string;
  targetModule: ConversationRuleTargetModule;
  scope: 'project' | 'global';
  confidence: number;
}

/**
 * Persisted output of the classifier for a single session. Top-level fields
 * mirror the JSON the skill emits (camelCased on the daemon side).
 */
export interface ConversationDigest {
  sessionId: string;
  /** Original cwd of the conversation (mirrors `ConversationIngestSession.projectPath`). */
  projectPath: string;
  /** ISO mtime of the source `.jsonl` at the time the digest was produced. */
  transcriptMtime: string;
  /** Which Claude model produced this digest. */
  model: 'haiku' | 'sonnet';
  /** Approximate input tokens sent to the model — helps surface cost. */
  inputTokens: number;
  /** Approximate output tokens billed for this run. */
  outputTokens: number;
  /** ISO timestamp when the classifier finished. */
  generatedAt: string;
  /** Detected dominant language of user turns. */
  language: 'fr' | 'en';
  /** One- or two-sentence narrative summary in the conversation language. */
  sessionSummary: string;
  phases: ConversationDigestPhase[];
  frictions: ConversationDigestFriction[];
  extractedRules: ConversationDigestRule[];
}

/** Lifecycle of a digest as exposed to the UI. */
export type ConversationDigestStatus = 'absent' | 'running' | 'ready' | 'failed';

/** Compact metadata returned by `project:listConversationDigests`. */
export interface ConversationDigestSummary {
  sessionId: string;
  status: ConversationDigestStatus;
  generatedAt: string | null;
  model: 'haiku' | 'sonnet' | null;
  /** Friction count, surfaced in lists for at-a-glance triage. */
  frictionCount: number;
  /** Extracted-rule count, surfaced alongside `frictionCount`. */
  ruleCount: number;
  /** When `status === 'failed'`, the human-readable error. */
  error: string | null;
}

/** Request payload for `project:classifyConversation`. */
export interface ClassifyConversationRequest {
  /** Original cwd of the project (used to look up the encoded ingest dir). */
  projectPath: string;
  sessionId: string;
}

/** Result of `project:classifyConversation`. */
export type ClassifyConversationResult =
  | { ok: true; digest: ConversationDigest }
  | { ok: false; error: string };
