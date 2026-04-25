# useElapsedTimer.ts

**Path:** `apps/frontend/src/hooks/useElapsedTimer.ts`

Live counter anchored on a real start time. Used by run views so reopening
the view mid-run keeps the counter in sync with the actual run age.

## Exports

### `useElapsedTimer`

```ts
function useElapsedTimer(startedAtIso: string): number
```

Ticks `elapsed` = `now − startedAt` every 500 ms. The start time is
captured once via a ref so the counter never resets if the parent re-renders.
