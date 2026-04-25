# DashboardRouter.tsx

**Path:** `apps/frontend/src/components/dashboard/DashboardRouter.tsx`

Pure switch from a `SidebarTab` to the matching dashboard view. Keeps the shell free of view-specific imports so it can stay focused on layout + project lifecycle. The `settings` tab is a placeholder until per-project settings ship.

## Exports

### `DashboardRouter`

```ts
export function DashboardRouter(props: { activeTab: SidebarTab; project: Project }): JSX.Element | null
```

Switches between `ProjectOverview`, `SkillsView`, `ConversationsView`, `RecommendationsView`, and the settings placeholder.

```ts
interface DashboardRouterProps {
  /** Active sidebar tab — selects which view component to render. */
  activeTab: SidebarTab;
  /** Currently selected project, forwarded to every view that needs it. */
  project: Project;
}
```
