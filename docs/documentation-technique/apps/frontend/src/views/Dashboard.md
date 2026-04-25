# Dashboard.tsx

**Path:** `apps/frontend/src/views/Dashboard.tsx`

Top-level dashboard shell for project-scoped views: tab strip of opened projects, language picker, and a sidebar that switches between dashboard sub-routes (overview / skills / conversations / recommendations / settings). Pulls open/active project state from `useProject` and language preferences from `usePreferences` (persisted via `window.nakiros.getPreferences` / `setPreferences`). Renders `DashboardRouter` inside a `DashboardErrorBoundary` keyed by `<projectId>:<activeTab>` so a crash in one tab does not poison the others. Mounted from `App.tsx` once a project is open.

## Exports

### `default` — `Dashboard`

```ts
export default function Dashboard(props: Props): JSX.Element
```

Top-bar (project tabs + language menu) plus the main content area (sidebar + router). Props: `{ onGoHome: () => void }`.
