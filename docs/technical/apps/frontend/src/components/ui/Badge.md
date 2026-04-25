# Badge.tsx

**Path:** `apps/frontend/src/components/ui/Badge.tsx`

Inline pill component used across the Nakiros frontend to label statuses, counts and short tags. Pure Tailwind + CSS variables — no external UI library — so the badge picks up the global theme automatically.

## Exports

### `BadgeVariant`

```ts
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'
```

Visual tone for a `Badge`, mapped to CSS variables in the Nakiros theme.

### `Badge`

```ts
export function Badge(props: BadgeProps): JSX.Element
```

Inline pill used to label statuses, counts, or short tags. Renders a `<span>` with a tone-coloured border + soft background driven by the global theme tokens.

**Parameters:**
- `variant` — visual tone of the badge (`'muted'` by default).
- `className`, `children`, `...rest` — forwarded to the underlying `<span>`.
