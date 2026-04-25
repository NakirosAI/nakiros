# dashboard/

**Path:** `apps/frontend/src/components/dashboard/`

Shell-level pieces of the project dashboard: the error boundary that wraps the active sub-view and the router that maps a sidebar tab to its view component.

## Files

- [DashboardErrorBoundary.tsx](./DashboardErrorBoundary.md) — React error boundary wrapped around the dashboard view tree, with a localised fallback and reset key.
- [DashboardRouter.tsx](./DashboardRouter.md) — Pure switch from a `SidebarTab` to the matching dashboard view.
