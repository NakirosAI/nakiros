/**
 * Tokenization primitives for Jaccard-based clustering. Shared between
 * {@link conversation-analyzer} (zone detection) and
 * {@link recommendation-cluster} (pattern detection across zones). Both
 * must use the same tokens so similarity scores are comparable.
 */

/**
 * Stop words (FR + EN, case-insensitive). Common function words carry no
 * topical meaning and would inflate similarity between unrelated messages.
 */
export const STOP_WORDS = new Set([
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc',
  'car', 'que', 'qui', 'quoi', 'comment', 'pourquoi', 'tu', 'je', 'il',
  'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'avec',
  'sans', 'pour', 'par', 'dans', 'sur', 'sous', 'entre', 'aussi',
  'pas', 'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'fait',
  'faire', 'voir', 'avoir', 'être', 'etre', 'pouvoir', 'falloir',
  'vouloir', 'savoir', 'oui', 'non', 'peut', 'doit', 'va',
  // EN
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'can', 'could', 'may', 'might',
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'us',
  'for', 'in', 'on', 'at', 'to', 'of', 'with', 'as', 'by',
  'yes', 'no', 'not', 'just', 'only',
]);

/**
 * Synthetic "user" messages injected by Claude Code when the user hits ESC.
 * Not real user turns — must be excluded from anything that aggregates user
 * messages (e.g. stuck-cluster zone detection).
 */
export const SYNTHETIC_USER_TEXTS = new Set([
  '[Request interrupted by user for tool use]',
  '[Request interrupted by user]',
]);

/**
 * Returns true if the given text is a synthetic interrupt message injected by
 * Claude Code, not an actual user turn.
 */
export function isSyntheticUserMessage(text: string): boolean {
  return SYNTHETIC_USER_TEXTS.has(text.trim());
}

/**
 * Tokenize a string for Jaccard clustering:
 * - Lowercase
 * - Split on `/\W+/`
 * - Drop tokens shorter than 3 chars
 * - Drop stop words
 */
export function tokenizeForCluster(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const t of text.toLowerCase().split(/\W+/)) {
    if (t.length >= 3 && !STOP_WORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

/**
 * Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|.
 * Returns 0 when either set is empty (avoids spurious 1.0 on two empty sets).
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
