# PatternList.tsx

**Path:** `apps/frontend/src/components/recommendations/PatternList.tsx`

Left-column list of friction-pattern recommendations. Each row shows a severity badge, a zone count, a top-token preview, and a hint about the analyser run status. Designed for the two-column `RecsScreen` layout. Renders an empty-state message from the `recommendations` i18n namespace when the pattern array is empty.

Severity colour mapping: `'high'` → `n-critical` tokens (red), `'medium'` → `n-watch` tokens (amber), consistent with the `ConvRow` health-zone colour semantics.

Top-token preview uses `break-words` so long domain-specific terms remain fully readable (per `feedback_no_truncate_user_content`).

## Exports

### `PatternList`

```ts
export function PatternList(props: Props): JSX.Element
```

Renders a `<ul>` of pattern rows. The selected row is highlighted with `bg-n-surface`; unselected rows use `hover:bg-n-raised`. Each row is a `<button>` that calls `onSelect` with the pattern id.

```ts
interface Props {
  /** Ordered array of patterns to display — typically from `listRecommendationPatterns`. */
  patterns: RecommendationPattern[];
  /** Id of the currently selected pattern, or `null` when none is selected. */
  selectedId: string | null;
  /** Called when the user clicks a pattern row. */
  onSelect(patternId: string): void;
}
```

**Parameters:**
- `patterns` — ordered array of patterns to display
- `selectedId` — id of the currently selected pattern, or `null`
- `onSelect` — callback invoked with the clicked pattern id
