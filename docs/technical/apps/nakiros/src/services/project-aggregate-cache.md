# project-aggregate-cache

**Path:** `apps/nakiros/src/services/project-aggregate-cache.ts`

Two-tier cache (in-memory deduplication + disk persistence) for per-project `ProjectAggregate` values. Disk entries live at `~/.nakiros/cache/aggregates/<projectId>.json`. A `AGGREGATE_VERSION` guard invalidates entries written before the current token-accounting semantics (v1: `totalTokens` excludes `cache_read`). After each recompute the daemon broadcasts `project:aggregateUpdated` via `eventBus` so the frontend can refresh without polling.

## Exports

### `loadProjectAggregate`

```ts
export function loadProjectAggregate(projectId: string): ProjectAggregate | null
```

Synchronous disk read of the persisted aggregate for `projectId`. Returns `null` when no cache file exists or the stored version is below `AGGREGATE_VERSION`. Intended as a fast first response (e.g. on IPC `project:getAggregate`) before an async refresh is triggered.

**Returns:** the persisted `ProjectAggregate`, or `null` on any miss or stale version.

---

### `refreshProjectAggregate`

```ts
export function refreshProjectAggregate(projectId: string): Promise<ProjectAggregate | null>
```

Recompute the aggregate for `projectId` by walking every conversation through `getOrComputeAnalysis`, persist the new entry to `~/.nakiros/cache/aggregates/<projectId>.json`, and broadcast `project:aggregateUpdated` on `eventBus`.

Concurrent calls for the same `projectId` share a single in-flight recompute via an internal `Map<string, Promise>` — only one recompute runs at a time per project. The dedup entry is removed when the promise settles (success or error).

**Returns:** the freshly computed `ProjectAggregate`, or `null` if the project is unknown.
