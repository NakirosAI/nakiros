import { pipeline, env, type TextClassificationPipeline } from '@xenova/transformers';

import { getModelsDir } from './paths.js';

export const SENTIMENT_MODEL_ID =
  'Xenova/distilbert-base-multilingual-cased-sentiments-student';

let cached: TextClassificationPipeline | null = null;
let pending: Promise<TextClassificationPipeline> | null = null;

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
export async function getSentimentPipeline(): Promise<TextClassificationPipeline> {
  if (cached) return cached;
  if (pending) return pending;
  configureEnv();
  pending = pipeline('text-classification', SENTIMENT_MODEL_ID, { quantized: true })
    .then((p) => {
      cached = p as TextClassificationPipeline;
      pending = null;
      return cached;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
