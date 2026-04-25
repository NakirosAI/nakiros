# Home.tsx

**Path:** `apps/frontend/src/views/Home.tsx`

Landing screen of the app: header, recent-project list, and tabs to navigate to plugin / global skills views. Shown after onboarding/scan complete and whenever the user clicks the logo from the dashboard. Sorts projects by `lastActivityAt` (newest first), flags inactive ones (>30 days), and exposes the `Rescan` and "Nakiros skills" entry points. All actions are delegated to props — the view itself only owns local UI state (tab, show-all toggle).

## Exports

### `default` — `Home`

```ts
export default function Home(props: Props): JSX.Element
```

Renders the header, tabs, optional boot-error banner, and the project list. Props: `projects`, `onOpenProject`, `onRescan`, `onDismissProject`, `onOpenNakirosSkills`, `onOpenGlobalSkills`, `onOpenPluginSkills`, optional `bootError`.
