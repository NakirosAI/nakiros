# index.ts

**Path:** `apps/nakiros/src/services/sentiment/index.ts`

Public façade of the sentiment service. Re-exports the model ID, skip predicate, and path helpers, and exposes the three entry points the ingest pipeline calls: `warmupSentiment`, `scoreText`, and `scoreBatch`. Label normalisation (vendor label strings → `SentimentLabel` union) is performed here so callers receive typed values regardless of model output format.

## Exports

### `SENTIMENT_MODEL_ID`

Re-exported from `./pipeline.ts` — see [pipeline.ts.md](./pipeline.ts.md).

### `shouldSkipForSentiment`

Re-exported from `./skip-rules.ts` — see [skip-rules.ts.md](./skip-rules.ts.md).

### `getSentimentTracePath`

Re-exported from `./paths.ts` — see [paths.ts.md](./paths.ts.md).

### `getProjectSentimentDir`

Re-exported from `./paths.ts` — see [paths.ts.md](./paths.ts.md).

### `warmupSentiment`

```ts
export async function warmupSentiment(): Promise<void>
```

Lazy-loads the pipeline and returns it ready for inference. Used by the ingest runner to warm the model before scoring the first message of a batch — keeps cold-start latency out of the per-message timing.

### `scoreText`

```ts
export async function scoreText(
  text: string,
): Promise<{ label: SentimentLabel; score: number } | null>
```

Score a single text. Returns `null` if the text is skipped by skip-rules. Throws on inference errors so the caller can decide to retry or drop the trace entirely.

**Returns:** `{ label, score }` with `label` normalised to `SentimentLabel`, or `null` if skipped.

**Throws:** Any inference error from the underlying pipeline.

### `scoreBatch`

```ts
export async function scoreBatch(
  inputs: Array<{ messageIndex: number; text: string }>,
  options?: { onError?: (err: unknown, messageIndex: number) => void },
): Promise<SentimentEntry[]>
```

Score a list of `{ messageIndex, text }` pairs in order. Skipped messages are absent from the returned entries (no placeholder). Errors on a single message are logged via `onError` and the message is dropped — they should not abort the whole trace.

**Parameters:**
- `inputs` — Ordered list of user messages with their 1-indexed position in the conversation.
- `options.onError` — Optional per-message error callback. Receives the error and the `messageIndex` of the failing message.

**Returns:** Array of `SentimentEntry` records for messages that were scored (skipped + errored messages are absent).
