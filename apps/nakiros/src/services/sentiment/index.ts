import type { SentimentEntry, SentimentLabel } from '@nakiros/shared';

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
 * Score a single text using the 5-class star rating model (nlptown bert). Sums
 * per-star probabilities into a 3-class distribution:
 *   - Negative = P(1*) + P(2*)
 *   - Neutral  = P(3*)
 *   - Positive = P(4*) + P(5*)
 * Picks the top class and returns its summed probability as the score. Returns
 * null if the text is skipped by skip-rules.
 */
export async function scoreText(
  text: string,
): Promise<{ label: SentimentLabel; score: number } | null> {
  if (shouldSkipForSentiment(text)) return null;
  const pipe = await getSentimentPipeline();
  // topk:5 to retrieve all 5 star probabilities and build the 3-class
  // distribution via summed probabilities — more calibrated than topk:1 direct.
  const result = (await pipe(text, { topk: 5 })) as unknown as Array<{
    label: string;
    score: number;
  }>;
  const buckets = { Negative: 0, Neutral: 0, Positive: 0 } as Record<SentimentLabel, number>;
  for (const r of result) {
    const stars = parseStarLabel(r.label);
    if (stars === null) continue;
    if (stars <= 2) buckets.Negative += r.score;
    else if (stars === 3) buckets.Neutral += r.score;
    else buckets.Positive += r.score;
  }
  // Pick the top class.
  let topLabel: SentimentLabel = 'Neutral';
  let topScore = buckets.Neutral;
  if (buckets.Negative > topScore) {
    topLabel = 'Negative';
    topScore = buckets.Negative;
  }
  if (buckets.Positive > topScore) {
    topLabel = 'Positive';
    topScore = buckets.Positive;
  }
  return { label: topLabel, score: topScore };
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

/**
 * Parse a label like "1 star", "4 stars" into 1-5. Returns null on garbage —
 * the caller skips the bucket.
 */
function parseStarLabel(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^(\d)\s*stars?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 5 ? n : null;
}
