# sentiment-store.ts

**Path:** `apps/nakiros/src/services/sentiment/sentiment-store.ts`

Read/write persistence layer for `SentimentTrace` records. Writes are atomic (write-to-tmp then rename) to prevent partial reads from a concurrent ingest process. Reads are lenient — a missing or malformed file returns `null` rather than throwing.

## Exports

### `loadSentimentTrace`

```ts
export function loadSentimentTrace(
  projectPath: string,
  sessionId: string,
): SentimentTrace | null
```

Read a persisted sentiment trace for a given session. Returns `null` if no trace exists or if the on-disk file is malformed.

**Returns:** Parsed `SentimentTrace` or `null` on absence / parse failure.

### `persistSentimentTrace`

```ts
export function persistSentimentTrace(trace: SentimentTrace): void
```

Atomic write — writes to `<sid>.json.tmp` then renames to `<sid>.json`. Prevents partial reads when the ingest pipeline and a concurrent reader access the same file.

Side effects: creates `<sid>.json.tmp` in the project's sentiment folder, then renames it to `<sid>.json` (overwriting any prior trace for the same session).
