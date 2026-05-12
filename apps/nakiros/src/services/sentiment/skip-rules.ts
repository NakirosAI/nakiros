/**
 * Decide whether a user message should be skipped by sentiment scoring.
 * Code pastes drown the multilingual model in tokens that don't carry user
 * affect — skip them to keep precision high and inference cheap.
 *
 * A message is skipped if any of the following is true:
 *   - empty or shorter than 5 characters;
 *   - contains a triple-backtick fenced block;
 *   - more than 40% non-alphabetic characters (counts unicode letters).
 */

const MIN_LENGTH = 5;
const NON_ALPHA_THRESHOLD = 0.4;

/**
 * Returns `true` when the given text should be excluded from sentiment scoring.
 * Callers should treat a `true` return as a skip-and-omit signal — no entry is
 * produced for the message in the final `SentimentTrace`.
 */
export function shouldSkipForSentiment(text: string): boolean {
  if (!text || text.length < MIN_LENGTH) return true;
  if (text.includes('```')) return true;
  const alpha = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const nonAlphaRatio = (text.length - alpha) / text.length;
  return nonAlphaRatio > NON_ALPHA_THRESHOLD;
}
