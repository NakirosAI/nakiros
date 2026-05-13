# PatternDetail.tsx

**Path:** `apps/frontend/src/components/recommendations/PatternDetail.tsx`

Right-side detail panel for a selected friction pattern. Combines a header summary (severity chip, zone count, file count, signal kinds), an Analyze button, live status banners, and a scrollable list of `RecoCard` items.

Subscribes to `recommendations:event` via `window.nakiros.onRecommendationsEvent` so the reco list live-updates when the analyser run completes without requiring the user to refresh. A "Show dismissed" toggle reveals cards filtered out of the default view.

The Analyze button transitions: idle → shows "Analyze"; after a successful run → shows "Re-analyze". While running it is disabled. Errors are surfaced via `window.alert` (v1; a toast system can replace this later).

## Exports

### `PatternDetail`

```ts
export function PatternDetail(props: Props): JSX.Element
```

```ts
interface Props {
  /** The project this pattern belongs to. */
  projectId: string;
  /** The pattern to display — must be the same object reference updated by the parent on refresh. */
  pattern: RecommendationPattern;
  /** Called when the user applies a card and the resulting run id should be opened. */
  onRunOpen(runId: string): void;
  /** Called after the analyser run completes so the parent can refresh the full pattern list. */
  onPatternsRefresh(): void;
}
```

**Parameters:**
- `projectId` — stable project identifier passed through to IPC calls
- `pattern` — the pattern to render; the component re-fetches recos on `pattern.id` change
- `onRunOpen` — callback invoked with the `runId` of the spawned downstream run (fix / edit / create)
- `onPatternsRefresh` — callback invoked after a run finishes so `RecsScreen` can reload the pattern list with updated `analysis.status`
