# useAgentRun.ts

**Path:** `apps/frontend/src/hooks/useAgentRun.ts`

React subscriptions onto the global `agentRunStore`. Use these hooks anywhere in the UI to reflect "is something running on this target?" without prop-threading; the topbar pill, in-page status badges, and any dashboard tile share the same source of truth.

## Exports

### `function useAgentRun`

Subscribe to one specific run by id. Returns `undefined` when the run is unknown or has dropped out of the active set.

```ts
export function useAgentRun(id: string | null | undefined): AgentRun | undefined
```

### `function useActiveAgentRuns`

Subscribe to the full active set across every kind. Used by the topbar `RunsCenter` and any dashboard wanting to surface in-flight work. Result is cached inside the store — safe to compare by reference.

```ts
export function useActiveAgentRuns(): AgentRun[]
```
