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
