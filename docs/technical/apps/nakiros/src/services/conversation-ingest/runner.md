# runner

**Path:** `apps/nakiros/src/services/conversation-ingest/runner.ts`

Core ingest runner — drains the Stop-hook queue, performs full scans of `~/.claude/projects/`, and exposes lazy per-project indexers used by the project handlers. Also fires a best-effort sentiment pre-pass (via a void IIFE background block) after each user session is indexed, persisting a `SentimentTrace` under `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`.

## Exports

### `getQueueLength`

```ts
export function getQueueLength(): number
```

Returns the current number of unprocessed files in `~/.nakiros/ingest/queue/`. Used by the status endpoint to expose queue depth to the UI.

### `ingestSession`

```ts
export function ingestSession(
  sessionId: string,
  transcriptPath: string,
  cwdHint: string,
  forcedProjectPath?: string,
): IngestOutcome
```

Parse a single Claude Code (or Cowork) session JSONL and persist its turns under `projects/<encoded>/sessions/<sessionId>.json`, updating the index. Idempotent — re-ingesting the same transcript overwrites prior state.

After `upsertSession` succeeds, fires a `void (async () => { ... })()` background IIFE to score user messages via the sentiment pre-pass (`scoreBatch`). Only runs for `kind === 'user'` sessions; skips if the existing trace has the same `transcriptMtime`. Sentiment errors are logged and never fail the ingest.

**Parameters:**
- `sessionId` — Claude Code session UUID
- `transcriptPath` — absolute path to the `.jsonl` transcript
- `cwdHint` — fallback project path if the JSONL `cwd` field is missing
- `forcedProjectPath` — when provided, overrides `rawMeta.cwd || cwdHint`. Used for Cowork sessions where the `cwd` field inside the JSONL points to the internal sandbox path

**Returns:** `{ sessionId, ok: true }` on success, or `{ sessionId, ok: false, reason: string }` on failure

### `drainQueue`

```ts
export function drainQueue(): void
```

Drain every queue file currently on disk, ingesting each session. Files are deleted after a successful ingest; a failure leaves the queue file in place so the next run will retry. Broadcasts `conversationIngest:progress` events throughout.

### `fullScan`

```ts
export function fullScan(): { scanned: number; ingested: number; skipped: number }
```

Walk every `.jsonl` under `~/.claude/projects/` and ingest each one. Skips sessions already indexed at the same `lastTurnAt` mtime. Used by the "Run scan now" UI button and the initial backfill on first opt-in.

### `ensureProjectIndexed`

```ts
export function ensureProjectIndexed(providerProjectDir: string): { ingested: number; total: number }
```

Lazy per-project indexer — scan a single project's `~/.claude/projects/<encoded>/` folder, ingest sessions that are missing or stale, and skip the rest. Called by project handlers on every read to keep the ingest store fresh without requiring the user to opt in to the Stop hook. Cheap when everything is up-to-date (one `readdirSync` + N `statSync` calls).

### `ensureCoworkProjectIndexed`

```ts
export function ensureCoworkProjectIndexed(
  userDir: string,
  projectPath: string,
): { ingested: number; total: number }
```

Lazy per-project indexer for Cowork sessions. Walks every `local_<uuid>` group directory under `userDir`, keeps only those whose sidecar `userSelectedFolders` contains `projectPath`, then ingests any JSONL files that are missing from or stale in the ingest store.

**Parameters:**
- `userDir` — `<root>/<spaceId>/<userId>/` from the project registry
- `projectPath` — `space.folders[0].path` — the authoritative project path

### `aggregateStats`

Re-exported from `project-store.ts`. See [project-store.md](./project-store.md).
