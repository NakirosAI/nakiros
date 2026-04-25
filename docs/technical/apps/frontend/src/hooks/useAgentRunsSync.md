# useAgentRunsSync.ts

**Path:** `apps/frontend/src/hooks/useAgentRunsSync.ts`

Mirrors the daemon's active runs into the frontend `agentRunStore`. v1 covers audit only — eval / fix / create adapters land alongside the corresponding kind migrations. Runs disappearing from the daemon's active list are removed locally on the next tick.

## Exports

### `function useAgentRunsSync`

Mount this once at the app shell to keep `agentRunStore` mirrored with the daemon's active runs.

```ts
export function useAgentRunsSync(): void
```

Polls every 2s via `usePolling`. Each adapter inside translates its native run shape (e.g. `AuditRun`) into the unified `AgentRun` shape and calls `agentRunStore.syncKind(kind, mapped)`.
