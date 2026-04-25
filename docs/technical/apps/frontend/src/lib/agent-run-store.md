# agent-run-store.ts

**Path:** `apps/frontend/src/lib/agent-run-store.ts`

Tiny module-scoped store holding every active `AgentRun` regardless of its `kind` (audit / eval / fix / create / future). Adapters poll the daemon for their own kind and call `syncKind(kind, next)` to mirror the active set.

Intentionally minimal — no zustand, no redux. Just a `Map` plus `useSyncExternalStore` consumers in `hooks/useAgentRun.ts`.

## Exports

### `const agentRunStore`

```ts
export const agentRunStore: {
  subscribe(fn: () => void): () => void;
  getActiveSnapshot(): AgentRun[];
  get(id: string): AgentRun | undefined;
  syncKind(kind: AgentRunKind, next: AgentRun[]): void;
  clear(): void;
}
```

`syncKind` replaces the active set for the given kind: existing runs of that kind absent from `next` are removed; runs in `next` are upserted. Other kinds are untouched, so multiple adapters cohabit safely.
