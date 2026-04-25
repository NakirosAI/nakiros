# EvalMatrix.tsx

**Path:** `apps/frontend/src/components/eval-matrix/EvalMatrix.tsx`

The Evolution view: top-level container that fetches the skill's eval matrix and renders the grid + header + drawer. Replaces the old iteration-list panel inside `SkillsView`. Refreshes on `refreshKey` bump (after a new run). Each cell exposes both the with-skill and without-skill (baseline) results — clicking either opens `EvalMatrixDrawer` on the matching config.

## Exports

### `EvalMatrix`

```ts
export function EvalMatrix(props: { request; refreshKey?; collapsible?; defaultCollapsed? }): JSX.Element
```

Loading / error / empty / loaded states. Loaded view renders an `EvalMatrixHeader`, a sticky-first-column table of `EvalMatrixCellView` cells with `EvalMatrixTagBadge` per row, and footer rows for pass-rate, tokens, and Δ vs baseline. Drawer state is local.

```ts
interface Props {
  /** Identifies the skill + scope to load. */
  request: GetEvalMatrixRequest;
  /** Bump after a new run to force a refetch. */
  refreshKey?: number;
  /** Show a collapse toggle in the header (handy when sharing space). */
  collapsible?: boolean;
  /** When `collapsible`, start collapsed. */
  defaultCollapsed?: boolean;
}
```
