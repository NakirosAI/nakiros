# fix.ts

**Path:** `apps/nakiros/src/daemon/handlers/fix.ts`

Registers the `fix:*` IPC channels — skill iteration flow that edits a temp copy of the skill under `~/.nakiros/tmp-skills/` and lets the user sync to the real skill only after review. **The tmp_skill pattern is load-bearing** — evals run against the in-progress copy BEFORE it becomes the real skill.

## IPC channels

### Lifecycle
- `fix:start`, `fix:stopRun`, `fix:getRun`, `fix:finish`

### Stream
- `fix:sendUserMessage`, `fix:listActive`, `fix:listAll`, `fix:getBufferedEvents`

`fix:listActive` filters to non-terminal runs; `fix:listAll` returns the full registry (active + recently terminal) for the runs center.

### Evals in temp
- `fix:runEvalsInTemp` — runs the eval suite against the in-progress copy. Results are written inside the temp workdir, so the real skill stays untouched until the user syncs. The fix agent can read `benchmark.json` between turns.
- `fix:getBenchmarks` — paired `{ real, temp }` snapshots for the comparison UI

### Diff preview
- `fix:listDiff`, `fix:readDiffFile`

## Broadcasts

- `fix:event` — fix run lifecycle. `withBroadcastOnError` emits an `error` variant on this channel when a fix handler mutating a known run throws (e.g. `fix:sendUserMessage`, `fix:stopRun`, `fix:finish`) so the view gets out-of-band feedback even when the HTTP request rejects.
- `eval:event` — evals launched via `fix:runEvalsInTemp` emit on the eval channel. `fix:runEvalsInTemp` itself is wrapped with `withBroadcastOnError('eval:event', …)` so a failure (e.g. missing `evals.json`) surfaces an `error` event on the eval channel for the frontend to render.

## Exports

### `const fixHandlers`

```ts
export const fixHandlers: HandlerRegistry
```
