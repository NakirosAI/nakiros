# Sidebar.tsx

**Path:** `apps/frontend/src/components/Sidebar.tsx`

Vertical icon-only navigation rail rendered on the left of the dashboard. Pure presentational component: state lives in the parent shell which passes the active tab and an onChange handler. Settings sits alone at the bottom, separated by a divider.

## Exports

### `type SidebarTab`

```ts
export type SidebarTab = 'dashboard' | 'skills' | 'conversations' | 'recommendations' | 'settings';
```

Identifier of one of the top-level navigation tabs in the project shell. Drives both the `Sidebar` UI and the `DashboardRouter` view switch.

### `Sidebar` (default export)

```ts
export default function Sidebar(props: { active; onChange; labels }): JSX.Element
```

The navigation rail. Each tab gets a Lucide icon plus the i18n label passed in `labels`.

```ts
interface Props {
  /** Currently active tab — controlled by the parent shell. */
  active: SidebarTab;
  /** Called when the user clicks a different tab. */
  onChange(tab: SidebarTab): void;
  /** i18n labels keyed by tab id (rendered under each icon and as title). */
  labels: Record<SidebarTab, string>;
}
```
