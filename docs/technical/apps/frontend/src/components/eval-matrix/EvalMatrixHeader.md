# EvalMatrixHeader.tsx

**Path:** `apps/frontend/src/components/eval-matrix/EvalMatrixHeader.tsx`

Top strip of the matrix: sparkline of aggregated pass-rate, token delta vs baseline, and tag count summary. Compact, stays pinned above the grid.

## Exports

### `EvalMatrixHeader`

```ts
export function EvalMatrixHeader(props: { metrics: EvalMatrixMetrics }): JSX.Element
```

Renders: pass-rate sparkline + percentage + delta from previous iteration; tokens + delta; right-aligned tag counts (broken / flaky / fixed / new / noisy / stable). Internal `Sparkline` is a normalised polyline drawn in `currentColor` so it inherits the primary colour.
