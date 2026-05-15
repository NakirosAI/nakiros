# conversation-analysis-cache

**Path:** `apps/nakiros/src/services/conversation-analysis-cache.ts`

Disk-backed cache for per-conversation analysis results. Each entry is stored as a JSON file under `~/.nakiros/cache/analyses/<sessionId>.json` and is invalidated by comparing the source JSONL's `mtime` and byte size. A `CACHE_VERSION` constant guards against schema drift — entries written by an older version are silently discarded and recomputed.

## Exports

### `peekCachedAnalysis`

```ts
export function peekCachedAnalysis(
  providerProjectDir: string,
  sessionId: string,
): ConversationAnalysis | null
```

Pure cache lookup for `sessionId`. Validates the cache entry's version, then cross-checks the source JSONL `mtime` and `size` against the stored snapshot before returning.

Returns `null` on any miss (no file, parse error, version mismatch, or stale source) — does **not** fall through to recomputation. Callers that need a guaranteed result should use `getOrComputeAnalysis`.

**Parameters:**
- `providerProjectDir` — absolute path to the provider project dir containing `<sessionId>.jsonl`
- `sessionId` — Claude Code session identifier (also the cache file basename)

**Returns:** the cached `ConversationAnalysis`, or `null` on any miss.

---

### `getOrComputeAnalysis`

```ts
export function getOrComputeAnalysis(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): ConversationAnalysis | null
```

Cached wrapper around `analyzeConversation`. Returns the cached entry when the source JSONL is unchanged; otherwise recomputes, persists the new entry to `~/.nakiros/cache/analyses/<sessionId>.json`, and returns the fresh analysis.

Persistence is best-effort: a write failure is swallowed and the fresh result is still returned to the caller. If the source JSONL cannot be stat'd after analysis, the result is returned without being persisted.

**Parameters:**
- `providerProjectDir` — absolute path to the provider project dir
- `sessionId` — Claude Code session identifier
- `projectId` — Nakiros project identifier, forwarded to `analyzeConversation`

**Returns:** the `ConversationAnalysis`, or `null` if analysis itself failed.
