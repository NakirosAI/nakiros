/**
 * Structured fix-progress protocol.
 *
 * The fix-runner streams two artefacts produced by the `nakiros-skill-factory`
 * skill while it fixes a target skill in a tmp workdir:
 *
 *  - `outputs/fix-targets.jsonl` — append-only checklist of fix items derived
 *    from the latest audit / eval. Each line is a {@link FixTargetEntry}.
 *    The agent appends a `{ id, status: 'done' }` entry to mark a target as
 *    completed (last-line-wins per id).
 *  - `outputs/fix-findings.jsonl` — append-only narrative log of discoveries
 *    the agent made during the fix. Each line is a {@link FixFinding}.
 *
 * The daemon tails both files between turns and broadcasts the diff via
 * `AuditRunEvent`, so the frontend can drive the live "Targets from audit"
 * sidebar + the inline finding cards without round-tripping through the chat.
 */

export type FixTargetStatus = 'todo' | 'done';

/**
 * A single fix item derived from the audit. The agent writes one of these
 * up-front for every actionable failure, then re-emits an entry with the
 * same `id` and `status: 'done'` once the fix is applied.
 */
export interface FixTarget {
  /** Stable slug — unique within a run. e.g. `boundary-section`. */
  id: string;
  /** Human-readable action, e.g. "Add boundary section". */
  title: string;
  /**
   * Free-form provenance hint, e.g. `audit:safety.boundary` or
   * `eval:iteration-9`. Optional — purely informational for the UI.
   */
  source?: string;
  status: FixTargetStatus;
}

/**
 * One line of `outputs/fix-targets.jsonl`. The first occurrence of an `id`
 * registers a target with full fields; subsequent occurrences may carry only
 * `{ id, status }` to flip its state. The runner reduces these into the
 * effective {@link FixTarget} list.
 */
export interface FixTargetEntry {
  id: string;
  title?: string;
  source?: string;
  status: FixTargetStatus;
}

/**
 * One discovery emitted by the agent during the fix. Unlike targets, findings
 * are append-only — there is no `done` semantics. The agent uses them to
 * surface inline cards in the conversation timeline.
 */
export interface FixFinding {
  /** Short uppercase code, e.g. `BOUNDARY_MISSING`. */
  code: string;
  /** One-line headline shown as the card title. */
  title: string;
  /** Optional longer body — rendered under the title. */
  detail?: string;
  /**
   * ISO timestamp stamped by the daemon at observation time. The agent's
   * self-reported `ts` is overwritten — see `fix-runner.syncFixProgress`.
   */
  ts?: string;
  /**
   * Optional cross-references — typically `audit:<checkId>` or
   * `target:<targetId>` so the UI can highlight related items.
   */
  refs?: string[];
}

/**
 * One entry in the unified fix timeline derived from Claude Code's session
 * jsonl (`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`). Single
 * source of truth — replaces the previous text/tool/edit live-stream
 * pipeline. Each entry carries the original ISO `ts` from the jsonl line
 * so the frontend can render the timeline at the correct chronological
 * position regardless of when the user opened the screen.
 */
export type FixTimelineEntry =
  /** First message the user typed (or Nakiros's bootstrap prompt). */
  | { kind: 'user'; ts: string; text: string }
  /** Assistant's free-form text reply. */
  | { kind: 'assistant_text'; ts: string; text: string }
  /**
   * Assistant tool_use that is NOT a Write/Edit/MultiEdit and not on a
   * Nakiros runtime path. Rendered as the generic tool box.
   */
  | { kind: 'tool'; ts: string; name: string; display: string }
  /**
   * Assistant Write/Edit/MultiEdit on a skill source file. Rendered as
   * the rich diff card. Edits to runtime paths (outputs/, audits/, …) are
   * filtered out by the parser.
   */
  | { kind: 'edit'; ts: string; edit: FixEdit }
  /**
   * One finding the agent emitted by writing to `outputs/fix-findings.jsonl`.
   * Derived directly from the Write/Edit tool_use input — no separate file
   * tail. Each JSONL line in the agent's content becomes one entry; the
   * `ts` is the tool_use timestamp from the session jsonl.
   */
  | { kind: 'finding'; ts: string; finding: FixFinding }
  /**
   * One eval result emitted by the daemon when an in-temp eval batch
   * (`fix:runEvalsInTemp`) finished. Rendered inline as a green-bordered
   * card with `passed/total` and a diff button. Sourced from
   * `outputs/fix-eval-results.jsonl` so the timeline replays after a
   * daemon restart.
   */
  | { kind: 'eval_result'; ts: string; result: FixEvalResult };

/**
 * Per-eval slice of a {@link FixEvalResult}. Stored as part of the batch
 * result so the frontend can show the regression breakdown without an
 * extra round-trip.
 */
export interface FixEvalResultPerEval {
  /** Eval name from `evals.json`, e.g. `audit-bad-skill`. */
  evalName: string;
  /** Number of assertions that passed under `with_skill`. */
  passed: number;
  /** Total number of assertions evaluated under `with_skill`. */
  total: number;
}

/**
 * Result summary of an entire `runFixEvalsInTemp` batch — emitted once per
 * batch when every `SkillEvalRun` reaches a terminal state. Carries the
 * aggregate `passed/total` AND the per-eval breakdown so the frontend can
 * render a single iteration-recap card with regressions vs the previous
 * iteration.
 *
 * Persisted to `outputs/fix-eval-results.jsonl` (one line per batch) so a
 * daemon restart replays the timeline.
 */
export interface FixEvalResult {
  /** Iteration number assigned by the eval-runner inside the temp skill dir. */
  iteration: number;
  /** ISO timestamp at which the batch completed and the result was emitted. */
  ts: string;
  /** SkillEvalRun ids that produced this batch (with_skill + cached-baseline). */
  runIds: string[];
  /** Resolved model id used for this iteration (from `timing.json`). */
  modelFullId: string | null;
  /**
   * Final batch status: `completed` if every run reached `completed`, else
   * `failed` (any run failed) or `stopped`. The frontend tones the card.
   */
  status: 'completed' | 'failed' | 'stopped';
  /** Sum of `passed` across every with_skill eval in the batch. */
  passed: number;
  /** Sum of `total` across every with_skill eval in the batch. */
  total: number;
  /** Per-eval breakdown, ordered as written in `benchmark.json`. */
  evals: FixEvalResultPerEval[];
  /**
   * Snapshot of the previous iteration in the temp workdir (which mirrors
   * the last with_skill iter from the real skill — the temp seeding
   * preserves the highest-numbered iteration via `copyLatestIteration`).
   * `null` when this is the first eval batch on the fix run.
   */
  previous: {
    iteration: number;
    passed: number;
    total: number;
    /** Eval names whose with_skill pass rate regressed vs previous. */
    regressions: string[];
  } | null;
}

/**
 * One file modification surfaced inline in the fix conversation timeline.
 * Captured from the agent's `Write` / `Edit` tool calls — the daemon
 * intercepts the `tool_use.input` and forwards the before/after content
 * so the frontend can render a mini-diff card next to the surrounding
 * tool/text events.
 *
 * Stamped by the daemon at observation time (same policy as
 * {@link FixFinding}). Not persisted on the run snapshot — these flow
 * exclusively through the live event stream + the per-turn buffer for
 * remount replay.
 */
export interface FixEdit {
  /** `write` for full-file Write; `edit` for in-place Edit. */
  kind: 'write' | 'edit';
  /** Absolute path the agent passed to the tool. */
  path: string;
  /**
   * Path to display — typically relative to the temp workdir. The frontend
   * uses this for the card header so the user doesn't see the verbose
   * `~/.nakiros/tmp-skills/fix_xxx/SKILL.md` prefix every time.
   */
  displayPath: string;
  /**
   * Pre-modification content. Empty string for a `write` to a brand-new
   * file; the `old_string` for an `edit`.
   */
  before: string;
  /** Post-modification content. The `content` for `write`; the `new_string` for `edit`. */
  after: string;
  /** ISO timestamp stamped by the daemon when it observed the tool_use. */
  ts: string;
}
