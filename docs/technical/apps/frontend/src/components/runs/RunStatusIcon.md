# RunStatusIcon.tsx

**Path:** `apps/frontend/src/components/runs/RunStatusIcon.tsx`

Icon-only variant of {@link RunStatusBadge} for tight spaces (run lists, compact detail headers). Carries the same colour semantics; pair it with a label nearby when context is needed.

## Exports

### `RunStatusIcon`

```ts
export function RunStatusIcon(props: { status: RunBadgeStatus; size?: 'sm' | 'lg' }): JSX.Element
```

Returns the right Lucide icon (or a queued-dot placeholder) sized 14 px (`sm`, default) or 18 px (`lg`). Used inside `EvalRunsView`'s left run list and detail header where a full `RunStatusBadge` pill would crowd the layout.
