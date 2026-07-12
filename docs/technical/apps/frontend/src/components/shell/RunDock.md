# RunDock.tsx

**Path:** `apps/frontend/src/components/shell/RunDock.tsx`

Pill in the new-shell topbar showing live counts of agent runs (running /
waiting / recently done) with a dropdown listing them grouped by status.
Subscribes to `agentRunStore` via `useSyncExternalStore` so any kind
reconciliation tick from `useAgentRunsSync` propagates here without prop
wiring.

Mirrors the new-design mockup `RunDockTrigger` + `RunDockPanel` but rebuilt
on real `AgentRun` data: statuses translate to mockup tones (`pending`/
`running` → "running", `awaiting_input` → "waiting", `done` → "done",
`failed`/`cancelled` → "failed").

Every `AgentRunKind` the store carries must have a `kindVisual` case (icon +
color) and, when its target isn't the generic `SkillRunTarget`, a branch in
`resolveTargetLabel` — both are module-local switch/if-chains, not exported,
but they're exhaustive over `AgentRunKind`/`AgentRunTarget` so adding a new
kind/target without updating them is a compile error. `bootstrap` reuses the
`Rocket` icon (same as the sidebar nav item and `BootstrapScreen` header)
and `resolveTargetLabel` resolves its `BootstrapRunTarget.projectId` to the
project name like every other project-scoped target.

Run-detail rendering is out of scope here; `onOpenRun` hands the clicked
`AgentRun` to the caller (`NewShell.handleOpenRun`), which decides whether
to open a generic `kind: 'run'` tab or (for `bootstrap`) navigate to the
project's dedicated Bootstrap view instead.

## Exports

### `RunDock` (default export)

```ts
export default function RunDock(props: RunDockProps): JSX.Element | null
```

Renders `null` when the store has no runs at all. Otherwise renders the
topbar trigger button plus, when open, `RunDockPanel` — grouped rows with
a stop button (visible when `getRunAPI(run.kind) !== null` and the run
isn't terminal) and a dismiss button (visible once terminal).

**Props** (`RunDockProps`, not exported — local to this file):
- `onOpenRun(run)` — called when the user activates a run row.
- `projects` — used to resolve a run's target into a display label.
