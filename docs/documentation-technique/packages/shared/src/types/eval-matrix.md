# eval-matrix.ts

**Path:** `packages/shared/src/types/eval-matrix.ts`

Aggregated view of a skill's eval history: a 2D grid where rows are individual evals and columns are iteration numbers. Drives the Evolution view in the UI. Also defines the per-row behaviour tags (STABLE / FLAKY / BROKEN / FIXED / NEW / NOISY), which use the skill fingerprint to tell apart real regressions from LLM-judge variance.

## Exports

### `interface EvalMatrixCell`

Single cell in the matrix — one eval at one iteration for one config (with_skill / without_skill).

### `type EvalMatrixTag`

Categorisation of an eval's behaviour across its history. Computed from the sequence of `with_skill` cells + fingerprint comparison. Only one tag is set per eval; priority when multiple signals apply: `broken > fixed > flaky > noisy > new > stable`.

Discriminants and carried fields:
- `stable` — `variance`
- `flaky` — `variance`, `since`
- `broken` — `since`, `drop`
- `fixed` — `since`, `gain`
- `new` — `since`
- `noisy` — `variance` (fingerprint unchanged → judge variance, not regression)

### `interface EvalMatrixRow`

One row of the matrix — all iterations for a single eval, plus its behaviour tag.

### `interface EvalMatrixMetrics`

Per-iteration aggregates + tag counts rendered in the matrix header (pass rate curve, tokens curve, tag badges).

### `interface EvalMatrix`

Complete eval matrix consumed by the Evolution view — iterations × evals grid + metrics.

### `interface GetEvalMatrixRequest`

Request payload for the `eval:getMatrix` IPC channel. `skillDirOverride` is used by fix runs so the matrix reflects the in-progress temp copy rather than the real persisted skill.

### `interface LoadIterationRunRequest`

Request payload for the `eval:loadIterationRun` IPC channel. Loads the full artefact bundle for a specific iteration's eval + config.

### `interface IterationRunArtifact`

Full artefact bundle for a single iteration run: raw `run.json`, detailed `grading.json`, output file listing, optional `diff.patch`, and timing.
