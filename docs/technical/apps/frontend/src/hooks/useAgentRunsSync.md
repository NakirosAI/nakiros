# useAgentRunsSync.ts

**Path:** `apps/frontend/src/hooks/useAgentRunsSync.ts`

Mirrors the daemon's runs into the frontend `agentRunStore` across every kind (audit / fix / create / edit / eval / classify-convo / bootstrap). Polls `*.listAll` every 2 s so active **and** recently-terminal runs surface in the topbar drawer; the store filters dismissed ids on upsert.

Audit / fix / create / edit map one-to-one onto an `AgentRun`; eval runs are grouped by `(scope, projectId, plugin/marketplace, skillName, iteration)` so a 5-run batch surfaces as a single drawer entry whose `meta.runIds` carries the constituent runs for the `EvalRunsView` overlay. `bootstrap` (Project `.claude` Bootstrap) also maps one-to-one via `bootstrapToAgentRun` — its two extra statuses (`awaiting_approval`, `executing`, absent from every other runner) fold into `awaiting_input` and `running` respectively via `BOOTSTRAP_STATUS_MAP` (the writer dispatch runs synchronously as part of approval, so `executing` is normally a brief transitional state), since the dock only needs the unified 4-state vocabulary, not the full plan/approval lifecycle (that lives in `views/BootstrapScreen.tsx`).

The seven `listAll*`/`listEvalRuns` calls are polled via `Promise.allSettled`, not `Promise.all` — each family is synced independently through the module-local `syncFamily` helper, which applies `agentRunStore.syncKind` on success or logs (once per failure streak, via the `failedFamilies` set) and skips a family on rejection. Before this, a single `Promise.all` meant one rejecting call (e.g. an old daemon in service mode missing the `bootstrap:*` IPC family during a version skew) threw before *any* `syncKind` call ran, silently stopping sync for every kind on every poll tick.

## Exports

### `function useAgentRunsSync`

Mount this once at the app shell.

```ts
export function useAgentRunsSync(): void
```
