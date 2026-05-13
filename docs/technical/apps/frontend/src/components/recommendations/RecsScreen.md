# RecsScreen.tsx

**Path:** `apps/frontend/src/components/recommendations/RecsScreen.tsx`

Top-level two-column recommendations screen. Owns the pattern list state; coordinates `PatternList` (left column, 320 px) and `PatternDetail` (right column, flex-fill) through shared `selectedId` state.

Loads patterns from `window.nakiros.listRecommendationPatterns` on mount and auto-selects the first pattern when the list is non-empty and nothing is selected. The Refresh button calls `refreshRecommendations` (force-recompute from cached analyses) and then reloads — it is disabled while loading.

Renders a brief empty-state message in the right column when no pattern is selected.

## Exports

### `RecsScreen`

```ts
export function RecsScreen(props: Props): JSX.Element
```

```ts
interface Props {
  /** Stable project identifier for all IPC calls within this screen. */
  projectId: string;
  /** Called when the user opens a spawned run (apply result). Navigates the shell to the run screen. */
  onRunOpen(runId: string): void;
}
```

**Parameters:**
- `projectId` — stable project identifier used for all `window.nakiros` calls on this screen
- `onRunOpen` — propagated to `PatternDetail` → `RecoCard`; invoked when the user opens a downstream run after applying a reco
