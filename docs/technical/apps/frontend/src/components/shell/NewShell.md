# NewShell.tsx

**Path:** `apps/frontend/src/components/shell/NewShell.tsx`

Main Nakiros shell. Driven by `useTabs`, opens projects, runs, skills and
marketplaces in parallel tabs. Hosts `NewShellTopBar` (tab strip + version
indicator + `RunDock`) and, for `kind: 'project'` tabs, `NewShellSidebar`
plus the active `ProjectTabView`'s screen component.

`handleOpenRun` is the single choke point through which the topbar
`RunDock` opens a clicked `AgentRun`. Every kind opens a generic
`kind: 'run'` tab (`RunScreen` dispatches further by `runKind`) **except**
`bootstrap`: since a bootstrap run's status set (`awaiting_approval` /
`executing`) and `plan` field don't fit that generic pipeline (see
`lib/run-api.ts`'s `AuditLikeRun` doc comment), `handleOpenRun` instead
opens (or refocuses) that project's tab and force-navigates it to the
`'bootstrap'` sidebar view, where `views/BootstrapScreen.tsx` owns the
run's entire lifecycle standalone. `openTab` only sets a tab's `view` when
it mints a brand new tab, so the handler always follows up with
`updateTab(id, { view: 'bootstrap' })` to cover the "project already open
on another view" case too.

Project lookup for the bootstrap branch tries `target.projectId` first,
then falls back to matching `target.projectPath` (a project can be
re-scanned and get a fresh id while its path stays stable). If neither
resolves, `handleOpenRun` does **not** fall through to the generic
`kind: 'run'` tab (that would render `AuditLikeRunScreen` with no approve
panel and a raw `'bootstrap'` header) — it's a no-op with a
`console.warn`, the shell having no lightweight toast primitive to reuse
for user-visible feedback here.

## Exports

### `NewShell` (default export)

```ts
export default function NewShell(props: NewShellProps): JSX.Element
```

**Props** (`NewShellProps`, not exported — local to this file):
- `projects` — every scanned project.
- `preferences` / `updatePreferences` — app-wide preferences, threaded through `PreferencesProvider`.
- `onRescan()` — re-scan `~/.claude/projects/`.
- `onDismissProject(id)` — remove a project from the workspace.
- `onProjectsChanged()` — re-fetch the project list after a mutation.
- `bootError?` — surfaced on `HomeScreen` when the daemon boot hit a snag.
