# DashboardErrorBoundary.tsx

**Path:** `apps/frontend/src/components/dashboard/DashboardErrorBoundary.tsx`

React error boundary wrapped around the dashboard view tree. Renders a localised "Something went wrong" panel with the error message and a retry button. Resets automatically when `resetKey` changes (the parent passes the active project + tab so switching either clears the error).

## Exports

### `DashboardErrorBoundary` (default export)

```ts
export default function DashboardErrorBoundary(props: { children; resetKey: string }): JSX.Element
```

Functional wrapper that pulls i18n strings from the `dashboard` namespace and forwards them to a class-based inner boundary (`DashboardErrorBoundaryInner`, not exported) which handles the actual `getDerivedStateFromError` / `componentDidCatch` lifecycle.

```ts
interface BoundaryProps {
  /** View tree to protect. */
  children: ReactNode;
  /** Bumping this clears any captured error (e.g. on tab/project change). */
  resetKey: string;
}
```
