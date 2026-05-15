# skip-rules.ts

**Path:** `apps/nakiros/src/services/sentiment/skip-rules.ts`

Filtering rules that decide whether a user message should be excluded from sentiment scoring. Code pastes and symbol-heavy text drown the multilingual model in non-affective tokens — skipping them keeps precision high and inference cheap. Called by `scoreText` in `index.ts` before dispatching to the pipeline.

## Exports

### `shouldSkipForSentiment`

```ts
export function shouldSkipForSentiment(text: string): boolean
```

Returns `true` when the given text should be excluded from sentiment scoring. Callers should treat a `true` return as a skip-and-omit signal — no entry is produced for the message in the final `SentimentTrace`.

A message is skipped if any of the following is true:
- empty or shorter than 5 characters;
- contains a triple-backtick fenced block;
- more than 40% non-alphabetic characters (counts unicode letters via `[a-zA-ZÀ-ÿ]`).

**Returns:** `true` if the message should be omitted from scoring.
