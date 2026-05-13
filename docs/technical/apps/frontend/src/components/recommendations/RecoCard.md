# RecoCard.tsx

**Path:** `apps/frontend/src/components/recommendations/RecoCard.tsx`

Single recommendation card rendered inside `PatternDetail`. Displays a structured header (action badge, artefact type badge, target path), a `MarkdownViewer` body, and a status-aware footer.

Footer behaviour by status:
- `'pending'` → Dismiss + Apply buttons (Apply opens `ApplyRecoModal`)
- `'applied'` → "Open run" button linking to the spawned downstream run
- `'dismissed'` → rendered passively; visibility is controlled by the parent toggle in `PatternDetail`

Target path renders with `break-all` so long file paths remain fully auditable (per `feedback_no_truncate_user_content`). Body markdown is rendered via `MarkdownViewer` (GFM + mermaid support).

## Exports

### `RecoCard`

```ts
export function RecoCard(props: Props): JSX.Element
```

```ts
interface Props {
  /** The recommendation card to render. */
  card: RecoCardType;
  /** Called when the user confirms applying — receives the (possibly edited) brief. */
  onApply(editedBrief: string): void;
  /** Called when the user clicks Dismiss. */
  onDismiss(): void;
  /** Called when the user clicks "Open run" on an applied card. */
  onOpenRun(runId: string): void;
}
```

**Parameters:**
- `card` — the `RecoCard` to render
- `onApply` — callback invoked with the brief text after the user confirms in `ApplyRecoModal`
- `onDismiss` — callback invoked when the user dismisses the card
- `onOpenRun` — callback invoked with the `appliedRunId` so the shell can navigate to the run
