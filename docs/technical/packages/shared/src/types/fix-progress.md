# fix-progress.ts

**Path:** `packages/shared/src/types/fix-progress.ts`

Defines the structured fix-progress protocol. The fix runner streams two JSONL artefacts — `outputs/fix-targets.jsonl` (append-only checklist) and `outputs/fix-findings.jsonl` (append-only narrative log) — that the daemon tails and broadcasts via `AuditRunEvent`, enabling the frontend to drive the live "Targets from audit" sidebar and inline finding cards. Also defines the `FixTimelineEntry` union and edit/eval-result types for the fix conversation view.

## Exports

### `FixTargetStatus`

```ts
export type FixTargetStatus = 'todo' | 'done';
```

### `FixTarget`

A single fix item derived from the audit. The agent writes one up-front for every actionable failure, then re-emits an entry with the same `id` and `status: 'done'` once the fix is applied.

```ts
export interface FixTarget {
  /** Stable slug — unique within a run. */
  id: string;
  /** Human-readable action, e.g. "Add boundary section". */
  title: string;
  /** Free-form provenance hint, e.g. `audit:safety.boundary`. Optional. */
  source?: string;
  status: FixTargetStatus;
}
```

### `FixTargetEntry`

One line of `outputs/fix-targets.jsonl`. The first occurrence of an `id` registers a target with full fields; subsequent occurrences may carry only `{ id, status }` to flip its state.

```ts
export interface FixTargetEntry {
  id: string;
  title?: string;
  source?: string;
  status: FixTargetStatus;
}
```

### `FixFinding`

One discovery emitted by the agent during the fix. Append-only — no `done` semantics. Used to surface inline cards in the conversation timeline.

```ts
export interface FixFinding {
  /** Short uppercase code, e.g. `BOUNDARY_MISSING`. */
  code: string;
  /** One-line headline shown as the card title. */
  title: string;
  detail?: string;
  /** ISO timestamp stamped by the daemon at observation time. */
  ts?: string;
  /** Cross-references — typically `audit:<checkId>` or `target:<targetId>`. */
  refs?: string[];
}
```

### `FixTimelineEntry`

Unified fix timeline entry derived from Claude Code's session JSONL. Extends `ChatTimelineEntry` with fix-specific kinds.

```ts
export type FixTimelineEntry =
  | ChatTimelineEntry
  | { kind: 'edit'; ts: string; edit: FixEdit }
  | { kind: 'finding'; ts: string; finding: FixFinding }
  | { kind: 'eval_result'; ts: string; result: FixEvalResult };
```

**Fix-specific variants:**
- `edit` — Assistant Write/Edit/MultiEdit on a skill source file. Rendered as the rich diff card.
- `finding` — One finding from `outputs/fix-findings.jsonl`. Derived from the Write/Edit tool_use input.
- `eval_result` — One eval result emitted when a `fix:runEvalsInTemp` batch finished. Sourced from `outputs/fix-eval-results.jsonl` for replay.

### `FixEvalResultPerEval`

Per-eval slice of a `FixEvalResult`. Stored as part of the batch result so the frontend can show the regression breakdown without an extra round-trip.

```ts
export interface FixEvalResultPerEval {
  /** Eval name from `evals.json`. */
  evalName: string;
  passed: number;
  total: number;
}
```

### `FixEvalResult`

Result summary of an entire `runFixEvalsInTemp` batch. Persisted to `outputs/fix-eval-results.jsonl` (one line per batch) so a daemon restart replays the timeline.

```ts
export interface FixEvalResult {
  iteration: number;
  ts: string;
  runIds: string[];
  modelFullId: string | null;
  status: 'completed' | 'failed' | 'stopped';
  passed: number;
  total: number;
  evals: FixEvalResultPerEval[];
  previous: {
    iteration: number;
    passed: number;
    total: number;
    regressions: string[];
  } | null;
}
```

### `FixEdit`

One file modification surfaced inline in the fix conversation timeline. Captured from the agent's Write / Edit tool calls. Not persisted — flows exclusively through the live event stream + per-turn buffer.

```ts
export interface FixEdit {
  /** `write` for full-file Write; `edit` for in-place Edit. */
  kind: 'write' | 'edit';
  /** Absolute path the agent passed to the tool. */
  path: string;
  /** Display path — typically relative to the temp workdir. */
  displayPath: string;
  /** Pre-modification content. Empty string for a new file's write. */
  before: string;
  /** Post-modification content. */
  after: string;
  /** ISO timestamp stamped by the daemon at observation. */
  ts: string;
}
```
