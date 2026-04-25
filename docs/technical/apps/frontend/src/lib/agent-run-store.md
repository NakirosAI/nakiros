# agent-run-store.ts

**Path:** `apps/frontend/src/lib/agent-run-store.ts`

Module-scoped store holding every `AgentRun` the UI cares about — both active runs (mirrored from the daemon) and recently-terminal runs the user hasn't dismissed yet. Adapters poll the daemon for their own kind and call `syncKind(kind, runs)` with the **full** set (active + recently terminal); runs marked dismissed by the user are filtered out before any upsert, so the daemon re-emitting a completed run on the next tick (or after a restart) doesn't make it reappear.

Dismissal is explicit and persisted in `localStorage` (`nakiros.dismissedRunIds`) — survives reloads and daemon restarts.

## Exports

### `function isTerminal`

True for `'done' | 'failed' | 'cancelled'`.

```ts
export function isTerminal(status: AgentRunStatus): boolean
```

### `const agentRunStore`

```ts
export const agentRunStore: {
  subscribe(fn: () => void): () => void;
  getActiveSnapshot(): AgentRun[];
  get(id: string): AgentRun | undefined;
  syncKind(kind: AgentRunKind, incoming: AgentRun[]): void;
  dismiss(id: string): void;
  dismissAllTerminal(): void;
  clear(): void;
}
```

`syncKind` reconciles the store with the daemon's full set for `kind`: dismissed ids are filtered out before upsert; existing runs of the same kind that disappear from `incoming` and were still active are transitioned to `done` (guards against the rare case where the daemon evicts a run before its terminal status surfaced). Other kinds are untouched, so multiple adapters cohabit.

`dismiss` and `dismissAllTerminal` mutate the persisted dismissed-ids set so the run never reappears on the next tick or session.
