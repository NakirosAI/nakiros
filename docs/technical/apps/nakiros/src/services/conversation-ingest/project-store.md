# project-store

**Path:** `apps/nakiros/src/services/conversation-ingest/project-store.ts`

Persistent project-keyed ingest index and session store. Manages `~/.nakiros/ingest/index.json` (the global V2 manifest) and lazy-loads session message bodies from per-project `sessions/<sid>.json` files. Owns V1 → V2 migration and the purge operation.

## Exports

### `IngestIndex`

```ts
export interface IngestIndex {
  version: 2;
  projects: Record<string, IngestProjectEntry>;
}
```

Project-keyed manifest. Keyed by absolute `projectPath` for O(1) lookups.

### `IngestProjectEntry`

```ts
export interface IngestProjectEntry {
  projectPath: string;
  encodedDir: string;
  sessions: Record<string, ConversationIngestSession>;
}
```

Per-project entry in the index. Session metadata is kept inline; message bodies are loaded lazily from `sessions/<sessionId>.json`.

### `IngestAggregateStats`

```ts
export interface IngestAggregateStats {
  totalProjects: number;
  totalUserSessions: number;
  totalSessions: number;
  totalTurns: number;
  lastIngestAt: string | null;
}
```

Cross-project aggregate statistics. `totalProjects` counts only user-kind projects; `totalSessions` includes all kinds (for diagnostics).

### `readIndex`

```ts
export function readIndex(): IngestIndex
```

Load the global ingest index from `~/.nakiros/ingest/index.json`. Returns a fresh empty index (version 2) when the file is absent or malformed — callers can therefore always treat the result as valid without checking for null.

### `upsertSession`

```ts
export function upsertSession(session: ConversationIngestSession): IngestIndex
```

Insert or update a session entry. Routes to the project sub-tree keyed by `session.projectPath`, creating the project entry on first sight. Returns the updated index so callers can broadcast aggregate stats without a follow-up read.

### `listProjects`

```ts
export function listProjects(): ConversationIngestProject[]
```

Project list, sorted by most-recent activity, with computed aggregates.

### `listSessionsForProject`

```ts
export function listSessionsForProject(projectPath: string): ConversationIngestSession[]
```

Sessions for a single project, sorted by most-recent activity.

### `listAllSessions`

```ts
export function listAllSessions(): ConversationIngestSession[]
```

Flat list across every project — used by diagnostics and the legacy `listSessions` IPC.

### `aggregateStats`

```ts
export function aggregateStats(): IngestAggregateStats
```

Compute cross-project aggregate statistics from the ingest index. Used by the daemon status endpoint and the UI header badge. O(projects × sessions).

### `migrateLegacyV1IfPresent`

```ts
export function migrateLegacyV1IfPresent(): { migrated: boolean }
```

One-shot migration from the V1 flat layout (`manifest.json` + `sessions/*.json`) to the V2 per-project layout. Idempotent — subsequent boots are no-ops once the legacy artefacts are gone.

### `purgeIngestData`

```ts
export function purgeIngestData(): void
```

Wipe every persisted project + the index + every per-project `sessions/` folder. Leaves the queue alone so any un-processed Stop-hook payloads will still be drained on the next run.

### `sessionBodyPath`

```ts
export function sessionBodyPath(session: ConversationIngestSession): string
```

Absolute path of the body file for a session.

### `readSessionBody`

```ts
export function readSessionBody(projectPath: string, sessionId: string): SessionBody | null
```

Read the parsed messages for a session. Returns `null` when the session is not yet indexed — callers should run `ensureProjectIndexed` first if a fresh ingest is desired before reading.

### `getSessionTranscriptDir`

```ts
export function getSessionTranscriptDir(projectPath: string, sessionId: string): string | null
```

Return the directory containing the source JSONL for a given session, by looking up the session's `transcriptPath` in the ingest store. Use this instead of `project.providerProjectDir` for providers (e.g. `'cowork'`) where the JSONL does not live directly under `providerProjectDir`.

**Returns:** absolute directory path, or `null` when the session is not found in the store

### `toProjectConversation`

```ts
export function toProjectConversation(session: ConversationIngestSession, projectId: string): ProjectConversation
```

Map an ingest-store session entry to the legacy `ProjectConversation` shape the project handlers expose to the UI. Centralised here so any field added to `ConversationIngestSession` that lifts up to the UI gets routed through one place.
