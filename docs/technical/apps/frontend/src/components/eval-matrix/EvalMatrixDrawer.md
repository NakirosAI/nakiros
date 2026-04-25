# EvalMatrixDrawer.tsx

**Path:** `apps/frontend/src/components/eval-matrix/EvalMatrixDrawer.tsx`

Slide-in drawer that loads and displays the full artefact of a single eval run (one cell of the matrix). Contents are fetched lazily through `loadIterationRun` when the drawer opens so the matrix itself stays lightweight. Sections rendered: assertions (with judge evidence), conversation (turns via `ConversationTurn`), generated outputs, sandbox diff (when git-worktree mode was used).

## Exports

### `EvalMatrixDrawer`

```ts
export function EvalMatrixDrawer(props: { request: LoadIterationRunRequest | null; onClose(): void }): JSX.Element | null
```

`null` request keeps the drawer fully unmounted. Header recaps eval/iter/config + token/duration totals once loaded. Backdrop click closes.
