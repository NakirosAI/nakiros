# EmptyState.tsx

**Path:** `apps/frontend/src/components/ui/EmptyState.tsx`

Centered placeholder shown when a list or panel has no data. Used by skill lists, run history, evaluation tabs, etc. Renders a dashed surface with an optional icon, a title, an optional subtitle and an optional primary action.

## Exports

### `EmptyState`

```ts
export function EmptyState(props: EmptyStateProps): JSX.Element
```

Renders a centered "nothing here yet" panel with a dashed border. The action delegates to the shared `Button` component (defaulting to `secondary` variant when not specified).

**Parameters:**
- `icon` — optional ReactNode rendered inside a circular badge.
- `title` — main heading text (required).
- `subtitle` — optional supporting copy.
- `action` — optional `{ label, onClick, variant? }` to render a single CTA button.
- `className` — optional class merged onto the outer container.
