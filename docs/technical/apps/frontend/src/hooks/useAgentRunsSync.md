# useAgentRunsSync.ts

**Path:** `apps/frontend/src/hooks/useAgentRunsSync.ts`

Mirrors the daemon's runs into the frontend `agentRunStore` across every kind (audit / fix / create / eval). Polls `*.listAll` every 2 s so active **and** recently-terminal runs surface in the topbar drawer; the store filters dismissed ids on upsert.

Audit / fix / create map one-to-one onto an `AgentRun`; eval runs are grouped by `(scope, projectId, plugin/marketplace, skillName, iteration)` so a 5-run batch surfaces as a single drawer entry whose `meta.runIds` carries the constituent runs for the `EvalRunsView` overlay.

## Exports

### `function useAgentRunsSync`

Mount this once at the app shell.

```ts
export function useAgentRunsSync(): void
```
