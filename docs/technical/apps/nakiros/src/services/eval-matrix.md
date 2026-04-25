# eval-matrix.ts

**Path:** `apps/nakiros/src/services/eval-matrix.ts`

Build the aggregated Evolution matrix from every iteration's `benchmark.json`. Produces the iterations × evals grid consumed by `eval:getMatrix`. Computes per-row behaviour tags (`stable` / `flaky` / `broken` / `fixed` / `new` / `noisy`) with fingerprint-aware heuristics: a regression with an identical fingerprint is `noisy` (judge variance), a regression with a changed fingerprint is `broken` (real code regression).

**Tuning constants:**
- `STABLE_STD_DEV_MAX = 0.10` — σ below → STABLE
- `FLAKY_STD_DEV_MIN = 0.20` — σ above → FLAKY / NOISY
- `BROKEN_ABSOLUTE_DROP = 0.30` — minimum drop to trigger BROKEN regardless of σ
- `FIXED_ABSOLUTE_GAIN = 0.30` — symmetric for FIXED
- `MIN_ITERATIONS_FOR_STABILITY_TAGS = 3` — need at least 3 points before stability tags are meaningful

## Exports

### `function buildEvalMatrix`

Build the eval matrix for a skill by walking every `iteration-N/benchmark.json` under its workspace. Returns an empty matrix shape if the skill has no history.

```ts
export function buildEvalMatrix(skillDir: string, skillName: string): EvalMatrix
```
