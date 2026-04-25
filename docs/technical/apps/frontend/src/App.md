# App.tsx

**Path:** `apps/frontend/src/App.tsx`

Root component of the Nakiros web UI. Boots the daemon, loads preferences, surfaces bundled-skill conflicts, and routes between the top-level views (`loading`, `scan`, `home`, `dashboard`, `nakiros-skills`, `global-skills`, `plugin-skills`).

## Exports

### `App` (default)

```ts
export default function App(): JSX.Element
```

Boots the daemon-backed app: loads preferences, surfaces bundled-skill conflicts, lists projects, and routes to the matching top-level view.

Side effects:
- Calls `window.nakiros.getPreferences()`, `listBundledSkillConflicts()`, `listProjects()` on mount.
- Forces `data-theme="dark"` and `colorScheme = 'dark'` on `<html>`.
- Resolves the i18n language from `AppPreferences.language` via [`resolveLanguage`](./utils/language.md).
- Persists preferences via `window.nakiros.savePreferences` and stamps `updatedAt`.

When the dashboard is active, wraps the project subtree in [`PreferencesProvider`](./hooks/usePreferences.md) and [`ProjectProvider`](./hooks/useProject.md) and renders [`Dashboard`](./views/Dashboard.md).
