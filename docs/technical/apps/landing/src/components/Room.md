# Room.tsx

**Path:** `apps/landing/src/components/Room.tsx`

Renders the "Control Room" section (section 02, v2 landing layout) — a tabbed panel with three static views: `.claude/` tree (using `ClaudeTree` + `SpecDonut`), an audit report panel, and an eval matrix panel. Each tab mirrors the real in-app screens in `apps/frontend`. Active tab is local state; tab keys come from `messages.room.tabs`.

## Exports

### `Room`

```ts
export function Room(): JSX.Element
```

"Control Room" section — tabbed panel showcasing three concrete views Nakiros offers on a `.claude/` folder: the canonical tree, an audit report, and an eval matrix. Occupies section 02 of the v2 landing layout.

Each tab is a static snapshot styled after the real screens in `apps/frontend` so the landing reads visually coherent with the in-app UI. Active tab is local state; tab keys come from `messages.room.tabs`.
