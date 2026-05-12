/**
 * Local sentiment pre-pass output — produced by the `apps/nakiros/src/services/sentiment`
 * module after a session body is ingested. Persisted as one JSON file per session under
 * `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`. Independent of the
 * V1.1 classifier output (`ConversationDigest`) so the brick stays isolated.
 */

export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative';

export interface SentimentEntry {
  /** 1-indexed user-message position within the conversation (matches digest turn numbering). */
  messageIndex: number;
  /** Top-1 label produced by the multilingual distilbert sentiment model. */
  label: SentimentLabel;
  /** Model confidence in `[0, 1]` for the top-1 label. */
  score: number;
  /**
   * First 120 characters of the original user message, used by the UI to
   * render tooltips and recap lists without re-reading the session body.
   * Optional for backward compatibility with traces written before this
   * field was introduced.
   */
  excerpt?: string;
}

export interface SentimentTrace {
  sessionId: string;
  projectPath: string;
  /** ISO mtime of the source `.jsonl` when the trace was produced. Allows skip-on-unchanged. */
  transcriptMtime: string;
  /** ISO timestamp when the scoring finished. */
  generatedAt: string;
  /** HF model id used to generate the trace. */
  model: string;
  /** One entry per scored user message. Messages skipped by skip-rules are absent. */
  entries: SentimentEntry[];
  /** Total user messages observed in the session (including skipped). */
  observed: number;
  /** Number of messages skipped by skip-rules. */
  skipped: number;
}

export type SentimentTraceStatus = 'absent' | 'running' | 'ready' | 'failed';

/**
 * Minimum confidence score for a Negative-labelled message to be treated as a
 * genuine friction point. Calibrated for the bert-nlptown 5-class multilingual
 * sentiment model with summed probabilities: P(Negative) = P(1★) + P(2★).
 *
 * At 0.60 the model captures real user frustration and corrections while
 * keeping the false-positive rate low — the Neutral bucket covers ~49% of
 * real session messages, so descriptive negation and short colloquial phrases
 * typically land below this threshold.
 *
 * Both the backend analyzer and the frontend UI import this constant so the
 * displayed signals are always aligned with the friction-point detection logic.
 */
export const SENTIMENT_FRICTION_THRESHOLD = 0.60;
