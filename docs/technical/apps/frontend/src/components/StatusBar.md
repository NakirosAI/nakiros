# StatusBar.tsx

**Path:** `apps/frontend/src/components/StatusBar.tsx`

Thin footer strip pinned at the bottom of the app window. Shows daemon status on the left and a workspace summary (repo count + topology) on the right. Pure presentational.

## Exports

### `StatusBar` (default export)

```ts
export default function StatusBar(props: { serverStatus; repoCount; topology }): JSX.Element
```

```ts
interface Props {
  /** Current daemon lifecycle phase. Drives the status label on the left. */
  serverStatus: 'starting' | 'running' | 'stopped';
  /** Number of detected project repos in the active workspace. */
  repoCount: number;
  /** Whether the workspace contains a single repo (mono) or several (multi). */
  topology: 'mono' | 'multi';
}
```
