# VersionIndicator.tsx

**Path:** `apps/frontend/src/components/VersionIndicator.tsx`

Tiny pill / inline marker showing the running CLI version and, when an update is available on npm, an actionable upgrade flow (modal with the `npm install -g` command). Hides itself entirely until the `useVersionInfo` hook resolves.

## Exports

### `VersionIndicator` (default export)

```ts
export default function VersionIndicator(props: { variant?: 'compact' | 'inline' }): JSX.Element | null
```

Two visual variants:
- `compact` (default) — rounded pill for the dashboard topbar
- `inline` — bare text marker for discreet placements (e.g. top-right of the home screen)

Both become clickable when an update is available and open a modal that shows the upgrade command and a link to the npm package page.

```ts
interface Props {
  /** `compact` rounded pill for the topbar, `inline` bare text marker. */
  variant?: 'compact' | 'inline';
}
```
