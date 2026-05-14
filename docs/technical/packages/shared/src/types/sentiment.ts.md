# sentiment.ts

**Path:** `packages/shared/src/types/sentiment.ts`

Shared types for the local sentiment pre-pass output. Produced by `apps/nakiros/src/services/sentiment` after a session is ingested, and persisted as one JSON file per session under `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`. Intentionally independent of the V1.1 classifier output (`ConversationDigest`) so the brick stays isolated.

## Exports

### `SentimentLabel`

```ts
export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative'
```

Top-1 sentiment label produced by the multilingual distilbert model. Vendor label strings are normalised to this union by `normalizeLabel` in the façade (`index.ts`).

### `SentimentEntry`

```ts
export interface SentimentEntry {
  /** 1-indexed user-message position within the conversation (matches digest turn numbering). */
  messageIndex: number
  /** Top-1 label produced by the multilingual distilbert sentiment model. */
  label: SentimentLabel
  /** Model confidence in [0, 1] for the top-1 label. */
  score: number
}
```

One scored user message. Messages skipped by `shouldSkipForSentiment` are absent from the `entries` array — they do not appear as placeholders.

### `SentimentTrace`

```ts
export interface SentimentTrace {
  sessionId: string
  projectPath: string
  /** ISO mtime of the source .jsonl when the trace was produced. Allows skip-on-unchanged. */
  transcriptMtime: string
  /** ISO timestamp when the scoring finished. */
  generatedAt: string
  /** HF model id used to generate the trace. */
  model: string
  /** One entry per scored user message. Messages skipped by skip-rules are absent. */
  entries: SentimentEntry[]
  /** Total user messages observed in the session (including skipped). */
  observed: number
  /** Number of messages skipped by skip-rules. */
  skipped: number
}
```

Full sentiment scoring output for one session. `transcriptMtime` enables the ingest pipeline to skip re-scoring when the source `.jsonl` has not changed. `observed` and `skipped` allow computing the scored ratio without iterating `entries`.

### `SentimentTraceStatus`

```ts
export type SentimentTraceStatus = 'absent' | 'running' | 'ready' | 'failed'
```

Lifecycle status of a sentiment trace as seen by the IPC layer. Used in Phase 4+ to expose trace readiness to the frontend without exposing the full trace on every poll.
