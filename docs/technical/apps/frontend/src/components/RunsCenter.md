# RunsCenter.tsx

**Path:** `apps/frontend/src/components/RunsCenter.tsx`

Topbar pill that surfaces every active agent run regardless of `kind`. Single source of truth for "is something running right now?", visible from any screen so the in-flight indicator survives navigation.

v1 lists active runs only; the dropdown is read-only (clicking a run calls `onOpenRun` if provided). Completed-run badges and notifications come in a later iteration.

## Exports

### `function RunsCenter`

```ts
export function RunsCenter(props: {
  onOpenRun?(run: AgentRun): void;
}): JSX.Element
```

Rendered once at the App shell level (fixed top-right). Reads the global `agentRunStore` via `useActiveAgentRuns` — no props for the run list itself.

The host (App.tsx) provides `onOpenRun` to handle navigation: typically calls `agentRunFocus.set(run)` then switches the top-level view to the run's native screen, where `useSkillsViewState` consumes the focus and selects the right skill.
