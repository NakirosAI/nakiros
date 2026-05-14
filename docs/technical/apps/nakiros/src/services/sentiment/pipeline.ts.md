# pipeline.ts

**Path:** `apps/nakiros/src/services/sentiment/pipeline.ts`

Singleton loader for the `@xenova/transformers` text-classification pipeline. Ensures the model is downloaded at most once per process lifetime, with deduplication of concurrent warm-up calls via a shared pending promise. Model weights are cached under `~/.nakiros/models/` (see `paths.ts`).

## Exports

### `SENTIMENT_MODEL_ID`

```ts
export const SENTIMENT_MODEL_ID =
  'Xenova/distilbert-base-multilingual-cased-sentiments-student'
```

HuggingFace model identifier used for sentiment scoring. Multilingual distilbert variant — covers French, English, and other Latin-script languages found in Claude Code sessions.

### `getSentimentPipeline`

```ts
export async function getSentimentPipeline(): Promise<TextClassificationPipeline>
```

Returns the singleton text-classification pipeline. First call downloads the model into `~/.nakiros/models/`; subsequent calls reuse the in-memory instance. Concurrent calls during the initial load share the same promise.

Side effects: on the first call, sets `env.cacheDir`, `env.allowRemoteModels`, and `env.allowLocalModels` on the `@xenova/transformers` env singleton before triggering the download.

**Returns:** Ready-to-call `TextClassificationPipeline` instance.

**Throws:** Any error from `@xenova/transformers` pipeline initialisation (network failure, corrupted model cache). The `pending` slot is cleared on error so a subsequent call will retry.
