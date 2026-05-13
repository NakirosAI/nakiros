# ApplyRecoModal.tsx

**Path:** `apps/frontend/src/components/recommendations/ApplyRecoModal.tsx`

Confirmation modal shown before a reco card is applied. Pre-populates a `<textarea>` with the card's `brief` so the user can inspect and edit the exact text that will be sent verbatim to the downstream fix / edit / create runner.

Built entirely with native HTML and `n-*` design tokens (no legacy `components/ui/*` components). The textarea uses `whitespace-pre-wrap` and `break-all` so long file paths, tool errors, and zone excerpts are never truncated — the user must be able to audit the full content before confirming.

Closes on Escape key press or backdrop click. Confirm is disabled when the trimmed brief is empty.

## Exports

### `ApplyRecoModal`

```ts
export function ApplyRecoModal(props: Props): JSX.Element
```

```ts
interface Props {
  /** The reco card being applied — used to initialise the brief textarea. */
  card: RecoCard;
  /** Called when the user clicks Confirm. Receives the current (possibly edited) brief text, already trimmed. */
  onConfirm(editedBrief: string): void;
  /** Called when the user closes the modal without confirming (backdrop click or Escape). */
  onClose(): void;
}
```

**Parameters:**
- `card` — the reco card to apply; `card.brief` initialises the textarea; `card.action` sets the run-kind label in the description
- `onConfirm` — invoked with the trimmed brief when the user clicks Confirm
- `onClose` — invoked when the user dismisses without confirming
