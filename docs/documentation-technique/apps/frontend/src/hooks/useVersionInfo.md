# useVersionInfo.ts

**Path:** `apps/frontend/src/hooks/useVersionInfo.ts`

Subscribes a component to the daemon's npm version-check result. The
daemon caches the npm response for 6 h, so multiple consumers don't hit
the registry directly.

## Exports

### `useVersionInfo`

```ts
function useVersionInfo(): VersionInfo | null;
```

Triggers one fetch on mount + a refresh every hour. Returns `null` while
the first fetch is in flight. Errors are swallowed silently — the hook
will retry on the next tick.
