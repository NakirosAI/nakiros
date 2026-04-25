# EvalMatrixCell.tsx

**Path:** `apps/frontend/src/components/eval-matrix/EvalMatrixCell.tsx`

A composite cell showing both configurations stacked: the top half is the with-skill result (primary, full-size, gradient colour), the bottom half is the baseline result (muted, small) — absent if no baseline run. Each half is independently clickable → opens the drawer on that config.

## Exports

### `EvalMatrixCellView`

```ts
export function EvalMatrixCellView(props: {
  withCell: Cell | null;
  withoutCell: Cell | null;
  selected: boolean;
  selectedConfig: 'with_skill' | 'without_skill' | null;
  onClickWith?: () => void;
  onClickWithout?: () => void;
}): JSX.Element
```

Empty placeholder when both halves are absent. Visual encoding via colour gradient of `passRate`: red (0%) → orange → yellow → lime → green (100%), with a muted variant for the baseline half. Tooltip surfaces tokens + duration on hover.
