import type { TextClassificationPipeline } from '@xenova/transformers';

import { getModelsDir } from './paths.js';

export const SENTIMENT_MODEL_ID =
  'Xenova/bert-base-multilingual-uncased-sentiment';

let cached: TextClassificationPipeline | null = null;
let pending: Promise<TextClassificationPipeline> | null = null;

/**
 * Returns the singleton text-classification pipeline. First call dynamically
 * imports `@xenova/transformers` (and triggers libvips/sharp init) and
 * downloads the model into `~/.nakiros/models/`; subsequent calls reuse the
 * in-memory instance. Concurrent calls during the initial load share the
 * same promise. Dynamic import keeps the daemon boot cheap — libvips is
 * loaded only when sentiment scoring actually fires.
 */
export async function getSentimentPipeline(): Promise<TextClassificationPipeline> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = getModelsDir();
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    const pipe = await pipeline('text-classification', SENTIMENT_MODEL_ID, {
      quantized: true,
    });
    cached = pipe as TextClassificationPipeline;
    pending = null;
    return cached;
  })().catch((err: unknown) => {
    pending = null;
    throw err;
  });
  return pending;
}
