/**
 * Shared types for the IDE-style 3-pane run layout.
 *
 * These are intentionally kept minimal — the host screen owns state; the
 * panel components communicate through props and callbacks of these shapes.
 */

/** A single selected passage quoted from the code viewer into the chat composer. */
export interface QuoteSelection {
  /** Path of the file the selection was taken from, relative to the workdir. */
  filePath: string;
  /** 1-based start line (inclusive). */
  startLine: number;
  /** 1-based end line (inclusive). */
  endLine: number;
  /** The verbatim text of the selected lines. */
  snippet: string;
}
