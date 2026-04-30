/**
 * Common base for the conversation timeline of any run kind (audit /
 * eval / fix / create), derived from Claude Code's session jsonl.
 *
 * Each entry carries the original ISO `ts` from the jsonl line, so the
 * frontend renders the timeline at the correct chronological position
 * regardless of when the user opened the screen — no synthetic
 * `Date.now()` stamping anywhere in the pipeline.
 *
 * Run-specific kinds (e.g. fix's `edit` / `finding` / `eval_result`) are
 * defined alongside the run-specific types and union with this base
 * (see {@link FixTimelineEntry}).
 */
export type ChatTimelineEntry =
  /** User message — initial prompt or reply. */
  | { kind: 'user'; ts: string; text: string }
  /** Assistant free-form text reply. */
  | { kind: 'assistant_text'; ts: string; text: string }
  /**
   * Assistant generic `tool_use` (Bash, Read, Glob, Grep, …). Renders as
   * the generic tool box. Run-specific renderers may intercept some
   * tools before they reach this kind (e.g. fix-runner promotes
   * Write/Edit on skill source files to its own `edit` kind).
   */
  | { kind: 'tool'; ts: string; name: string; display: string };

/**
 * Audit run conversation timeline. Audit doesn't emit run-specific kinds
 * — the audit-progress sidebar (manifest, sections, findings) lives on a
 * separate event stream, so the chat view only needs the three universal
 * kinds. Aliased rather than re-defined so the type tracks `ChatTimelineEntry`.
 */
export type AuditTimelineEntry = ChatTimelineEntry;
