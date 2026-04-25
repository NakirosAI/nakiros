# EvalMatrixTag.tsx

**Path:** `apps/frontend/src/components/eval-matrix/EvalMatrixTag.tsx`

Compact badge summarising an eval's behaviour across iterations. The kind (stable/flaky/broken/fixed/new/noisy) drives the icon, colour, and tooltip — each tooltip explains the underlying signal in plain language so the user can act on it.

## Exports

### `EvalMatrixTagBadge`

```ts
export function EvalMatrixTagBadge(props: { tag: EvalMatrixTag }): JSX.Element
```

Tooltip copy notably distinguishes `flaky` (skill changed between diverging iterations — likely non-determinism or a brittle assertion) from `noisy` (skill fingerprint did not change — pure LLM-judge variance, don't treat as a regression).
