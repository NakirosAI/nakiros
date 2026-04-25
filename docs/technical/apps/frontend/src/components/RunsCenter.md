# RunsCenter.tsx

**Path:** `apps/frontend/src/components/RunsCenter.tsx`

Topbar pill + slide-in drawer surfacing every agent run regardless of `kind`. Visible from any screen so the in-flight indicator survives navigation. The icon shows two distinct counters:

- **Active** (primary, spinner) when at least one run is in flight, with an emerald `+N` chip when terminal-unread runs are also waiting.
- **Completed-unread** (success/warning) when only terminal runs are waiting to be acknowledged.
- **Idle** (muted activity icon) when nothing is in the drawer.

The drawer slides in from the right (`w-96`, full height, opaque `bg-card`, semi-transparent backdrop). Closes on Escape, click-outside, or the X button. Body scroll is locked while open. Active runs render in an "Active" section above; terminal runs in a "Completed" section below with per-row dismiss `X` and a "Clear completed" footer button.

Clicking a row navigates to the run's native screen via the `useAgentRunNavigation` context.

## Exports

### `function RunsCenter`

```ts
export function RunsCenter(): JSX.Element
```

No props — reads the global `agentRunStore` via `useActiveAgentRuns` and resolves the click-to-navigate callback from `useAgentRunNavigation`. Render it once per top-level view inside the existing topbar (Home's fixed div, Dashboard's flex, the three skill views' TopBar).
