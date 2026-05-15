# conversation-ingest.ts

**Path:** `packages/shared/src/types/conversation-ingest.ts`

Types for the conversation-ingest module — opt-in pipeline that captures Claude Code session JSONL files (via a `Stop` hook + chokidar watcher) and persists parsed turns under `~/.nakiros/ingest/`. Covers the V1 opt-in UI, per-session/per-project metadata, and the V1.1 classifier digest that feeds the downstream friction-analysis engine.

## Exports

### `ConversationIngestSessionKind`

```ts
export type ConversationIngestSessionKind = 'user' | 'synthetic';
```

Tags a session as either real user activity or a Nakiros-internal sandbox run.

### `ConversationIngestStatus`

Current health and counters for the ingest pipeline. Returned by `conversationIngest:status`.

```ts
export interface ConversationIngestStatus {
  /** Hook installed AND queue watcher running. The end-user-facing toggle. */
  enabled: boolean;
  /** Whether the Stop hook command is currently present in `~/.claude/settings.json`. */
  hookInstalled: boolean;
  /** Absolute path of the hook script Nakiros writes when enabling ingest. */
  hookScriptPath: string;
  /** Absolute path of the user-global Claude settings file the hook is registered in. */
  settingsPath: string;
  /** Number of distinct **user** projects currently indexed. */
  totalProjects: number;
  /** Sum of `turnCount` across every **user** session. */
  totalTurns: number;
  /** Total session count across all kinds (user + synthetic). */
  totalSessions: number;
  /** ISO timestamp of the most recent successful session ingest, or `null`. */
  lastIngestAt: string | null;
  /** Number of un-processed queue files sitting under `~/.nakiros/ingest/queue/`. */
  queueLength: number;
}
```

### `ConversationIngestHookDiff`

Diff payload returned to the UI before the user opts in. Shows the exact JSON change about to be written to `~/.claude/settings.json` so the user can audit the mutation.

```ts
export interface ConversationIngestHookDiff {
  /** Absolute path of the user-global settings file we will mutate. */
  settingsPath: string;
  /** Whether `settings.json` currently exists on disk. */
  exists: boolean;
  /** Current settings.json content (empty string when `exists === false`). */
  current: string;
  /** Settings.json content after enabling. */
  next: string;
  /** Path of the hook script that will be installed. */
  hookScriptPath: string;
}
```

### `ConversationIngestSession`

Per-session metadata persisted in the index and exposed to the UI.

```ts
export interface ConversationIngestSession {
  sessionId: string;
  projectPath: string;
  transcriptPath: string;
  transcriptMtime: string;
  ingestedAt: string;
  turnCount: number;
  startedAt: string;
  lastTurnAt: string;
  kind: ConversationIngestSessionKind;
  gitBranch: string | null;
  claudeVersion: string | null;
  summary: string;
  toolsUsed: string[];
}
```

### `ConversationIngestProject`

Aggregate view of one project's ingested sessions. Computed from underlying session entries — never persisted independently.

```ts
export interface ConversationIngestProject {
  projectPath: string;
  encodedDir: string;
  displayName: string;
  kind: ConversationIngestSessionKind;
  totalSessions: number;
  totalTurns: number;
  firstTurnAt: string;
  lastTurnAt: string;
  lastIngestAt: string;
}
```

### `ConversationIngestProgressEvent`

Live event broadcast on `conversationIngest:progress` while the runner drains the queue.

```ts
export interface ConversationIngestProgressEvent {
  processed: number;
  total: number;
  currentSessionId: string | null;
  phase: 'idle' | 'scanning' | 'ingesting' | 'done' | 'error';
  error?: string;
}
```

### `ConversationIngestMutationResult`

Discriminated result for handlers that mutate state (enable / disable / purge / runNow).

```ts
export type ConversationIngestMutationResult =
  | { ok: true; status: ConversationIngestStatus }
  | { ok: false; code: ConversationIngestErrorCode; message: string };
```

### `ConversationIngestErrorCode`

```ts
export type ConversationIngestErrorCode =
  | 'settings-write-failed'
  | 'hook-script-write-failed'
  | 'already-enabled'
  | 'not-enabled'
  | 'purge-failed'
  | 'scan-failed';
```

### `ConversationFrictionKind`

```ts
export type ConversationFrictionKind =
  | 'miscomprehension'
  | 'rework'
  | 'user_takeover'
  | 'convention_violation'
  | 'scope_drift'
  | 'missing_documented_context'
  | 'wrong_abstraction_level';
```

Seven semantic friction kinds detected by the V1.1 classifier skill. See `references/friction-kinds.md` in the skill.

### `ConversationFrictionSeverity`

```ts
export type ConversationFrictionSeverity = 'low' | 'med' | 'high';
```

Severity of a friction — drives downstream prioritization in the propose-engine.

### `ConversationRuleScope`

```ts
export type ConversationRuleScope = 'project' | 'global' | 'none';
```

Whether a rule candidate is project-specific, cross-project, or non-generalizable.

### `ConversationRuleTargetModule`

```ts
export type ConversationRuleTargetModule =
  | 'rules'
  | 'claude_md'
  | 'subagent'
  | 'skill'
  | 'output_style';
```

Best-guess routing target for a rule candidate. Used by the V1.3 propose-engine to decide which `.claude/` editor to surface.

### `ConversationDigestPhase`

Phase of the conversation as segmented by the classifier.

```ts
export interface ConversationDigestPhase {
  /** Stable id within the digest, e.g. `p1`, `p2`. */
  id: string;
  /** Free-form snake_case label — `setup`, `implementation`, `debugging`, … */
  label: string;
  fromTurn: number;
  toTurn: number;
  /** One-sentence description of what the phase attempted (≤ 25 words). */
  summary: string;
}
```

### `ConversationDigestFriction`

A single semantic friction observed in the conversation.

```ts
export interface ConversationDigestFriction {
  phaseId: string;
  kind: ConversationFrictionKind;
  severity: ConversationFrictionSeverity;
  /** 1-indexed turn numbers backing this friction (ascending). */
  evidenceTurns: number[];
  /** Factual narrative of what went wrong, in the conversation language. */
  whatHappened: string;
  /** Rule that would have prevented this friction. `null` if too situational. */
  ruleCandidate: string | null;
  scope: ConversationRuleScope;
  /** Confidence in `[0, 1]`. Below 0.5 the classifier drops the entry. */
  confidence: number;
}
```

### `ConversationDigestRule`

A normalized rule extracted from one or more frictions in this session.

```ts
export interface ConversationDigestRule {
  /** Short prescriptive sentence ("Place HTTP routes under routes/, not server.ts"). */
  rule: string;
  why: string;
  phaseId: string;
  targetModule: ConversationRuleTargetModule;
  scope: 'project' | 'global';
  confidence: number;
}
```

### `ConversationDigest`

Persisted output of the classifier for a single session. Stored under `~/.nakiros/ingest/projects/<encoded>/digests/<sid>.json`.

```ts
export interface ConversationDigest {
  sessionId: string;
  projectPath: string;
  transcriptMtime: string;
  model: 'haiku' | 'sonnet';
  inputTokens: number;
  outputTokens: number;
  generatedAt: string;
  language: 'fr' | 'en';
  sessionSummary: string;
  phases: ConversationDigestPhase[];
  frictions: ConversationDigestFriction[];
  extractedRules: ConversationDigestRule[];
}
```

### `ConversationDigestStatus`

```ts
export type ConversationDigestStatus = 'absent' | 'running' | 'ready' | 'failed';
```

Lifecycle of a digest as exposed to the UI.

### `ConversationDigestSummary`

Compact metadata returned by `project:listConversationDigests`.

```ts
export interface ConversationDigestSummary {
  sessionId: string;
  status: ConversationDigestStatus;
  generatedAt: string | null;
  model: 'haiku' | 'sonnet' | null;
  frictionCount: number;
  ruleCount: number;
  error: string | null;
}
```

### `ClassifyConversationRequest`

Request payload for `project:classifyConversation`.

```ts
export interface ClassifyConversationRequest {
  /** Original cwd of the project (used to look up the encoded ingest dir). */
  projectPath: string;
  sessionId: string;
}
```

### `ClassifyConversationResult`

Result of `project:classifyConversation`.

```ts
export type ClassifyConversationResult =
  | { ok: true; digest: ConversationDigest }
  | { ok: false; error: string };
```
