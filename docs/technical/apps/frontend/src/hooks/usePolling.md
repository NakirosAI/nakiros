# usePolling.ts

**Path:** `apps/frontend/src/hooks/usePolling.ts`

Generic polling hook that runs a callback on a `setInterval` while the component is mounted. Replaces the repeated `useEffect + setInterval + cleanup` pattern used by run views and the skills view state.

## Exports

### `interface UsePollingOptions`

```ts
export interface UsePollingOptions {
  /** Set `false` to suspend polling without unmounting. Default: `true`. */
  enabled?: boolean;
  /** Run `fn` once immediately before starting the interval. Default: `true`. */
  immediate?: boolean;
}
```

### `function usePolling`

Run `fn` every `intervalMs` while the component is mounted. The hook keeps a ref to the latest `fn` so callers can pass an inline closure without restarting the timer on every render. Inflight async invocations after unmount are the caller's concern — the hook only stops new invocations.

```ts
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options?: UsePollingOptions,
): void
```
