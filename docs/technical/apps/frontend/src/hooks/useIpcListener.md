# useIpcListener.ts

**Path:** `apps/frontend/src/hooks/useIpcListener.ts`

Adapter from a daemon IPC `subscribe(handler) → unsubscribe` channel into a
React effect. Captures the latest `handler` in a ref so callers don't need
to memoize it.

## Exports

### `useIpcListener`

```ts
function useIpcListener<T>(
  subscribe: ((handler: (payload: T) => void) => () => void) | null | undefined,
  handler: (payload: T) => void,
  deps?: DependencyList,
  enabled?: boolean,
): void;
```

No-op when `subscribe` is nullish or `enabled` is `false`. Resubscribes
when `enabled`, `subscribe`, or any item in `deps` changes.
