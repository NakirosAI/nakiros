# eval-matrix/

**Path:** `apps/frontend/src/components/eval-matrix/`

Components composing the Evolution view and the Models comparison tab inside `SkillsView`. The matrix renders a grid of eval-iteration runs with paired baseline (with-skill / without-skill) and supports A/B/C model comparisons on a frozen iteration.

## Files

- [EvalMatrix.tsx](./EvalMatrix.md) — Top-level container for the Evolution view (grid + header + drawer).
- [EvalMatrixCell.tsx](./EvalMatrixCell.md) — Composite cell stacking the with-skill and baseline results.
- [EvalMatrixDrawer.tsx](./EvalMatrixDrawer.md) — Slide-in drawer loading the full artefact of a single eval run.
- [EvalMatrixHeader.tsx](./EvalMatrixHeader.md) — Header strip with pass-rate sparkline, token delta, and tag summary.
- [EvalMatrixTag.tsx](./EvalMatrixTag.md) — Compact badge summarising an eval's behaviour across iterations.
- [ModelComparison.tsx](./ModelComparison.md) — Models tab — A/B/C comparison of the same suite across multiple Claude model ids.
- [index.ts](./index.md) — Barrel exposing the components callers need to compose Evolution + Models tabs.
