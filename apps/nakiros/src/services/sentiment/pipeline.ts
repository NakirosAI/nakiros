import { pipeline, env } from '@xenova/transformers';

import { getModelsDir } from './paths.js';

export const SENTIMENT_MODEL_ID =
  'Xenova/distilbert-base-multilingual-cased-sentiments-student';

/**
 * The resolved pipeline type. `pipeline()` returns a discriminated union
 * (`AllTasks[T]`). By using `Awaited<ReturnType<typeof pipeline>>` we capture
 * the full union without importing the internal `Pipeline` base class, which
 * is not stable across @xenova/transformers minor versions.
 */
type AnyPipeline = Awaited<ReturnType<typeof pipeline>>;

let cached: AnyPipeline | null = null;
let pending: Promise<AnyPipeline> | null = null;

function configureEnv(): void {
  env.cacheDir = getModelsDir();
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
}

/**
 * Returns the singleton text-classification pipeline. First call downloads the
 * model into `~/.nakiros/models/`; subsequent calls reuse the in-memory
 * instance. Concurrent calls during the initial load share the same promise.
 */
export async function getSentimentPipeline(): Promise<AnyPipeline> {
  if (cached) return cached;
  if (pending) return pending;
  configureEnv();
  pending = pipeline('text-classification', SENTIMENT_MODEL_ID, { quantized: true })
    .then((p) => {
      cached = p;
      pending = null;
      return cached;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
