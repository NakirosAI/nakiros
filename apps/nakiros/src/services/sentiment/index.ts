import type { SentimentEntry, SentimentLabel } from '@nakiros/shared';
import type { TextClassificationSingle } from '@xenova/transformers';

import { getSentimentPipeline, SENTIMENT_MODEL_ID } from './pipeline.js';
import { shouldSkipForSentiment } from './skip-rules.js';

export { SENTIMENT_MODEL_ID };
export { shouldSkipForSentiment } from './skip-rules.js';
export { getSentimentTracePath, getProjectSentimentDir } from './paths.js';

/**
 * Lazy-loads the pipeline and returns it ready for inference. Used by the
 * ingest runner to warm the model before scoring the first message of a
 * batch — keeps cold-start latency out of the per-message timing.
 */
export async function warmupSentiment(): Promise<void> {
  await getSentimentPipeline();
}

/**
 * Score a single text. Returns `null` if the text is skipped by skip-rules.
 * Throws on inference errors so the caller can decide to retry or drop the
 * trace entirely.
 */
export async function scoreText(
  text: string,
): Promise<{ label: SentimentLabel; score: number } | null> {
  if (shouldSkipForSentiment(text)) return null;
  const pipe = await getSentimentPipeline();
  // We pass a single string so the runtime returns TextClassificationOutput
  // (i.e. TextClassificationSingle[]). Cast through unknown to satisfy the
  // union return type TextClassificationOutput | TextClassificationOutput[].
  const result = (await pipe(text, { topk: 1 })) as unknown as TextClassificationSingle[];
  const top = result[0];
  return {
    label: normalizeLabel(top?.label),
    score: typeof top?.score === 'number' ? top.score : 0,
  };
}

/**
 * Score a list of `{ messageIndex, text }` pairs in order. Skipped messages
 * are absent from the returned entries (no placeholder). Errors on a single
 * message are logged via `onError` and the message is dropped — they should
 * not abort the whole trace.
 */
export async function scoreBatch(
  inputs: Array<{ messageIndex: number; text: string }>,
  options?: { onError?: (err: unknown, messageIndex: number) => void },
): Promise<SentimentEntry[]> {
  const out: SentimentEntry[] = [];
  for (const { messageIndex, text } of inputs) {
    try {
      const scored = await scoreText(text);
      if (scored) {
        out.push({ messageIndex, label: scored.label, score: scored.score });
      }
    } catch (err) {
      options?.onError?.(err, messageIndex);
    }
  }
  return out;
}

function normalizeLabel(raw: unknown): SentimentLabel {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value.startsWith('pos')) return 'Positive';
  if (value.startsWith('neg')) return 'Negative';
  return 'Neutral';
}
