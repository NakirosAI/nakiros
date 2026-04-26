# analyze-convo.ts

**Path:** `apps/nakiros/src/daemon/handlers/analyze-convo.ts`

IPC bridge for the `analyze-convo` Run kind — a streaming deep analysis of a Claude Code conversation, promoted from the legacy one-shot `project:deepAnalyzeConversation` to a first-class run kind so users get live progress, mid-flight interactivity, and reboot-resume support. Resolves the project's `providerProjectDir` via `getProject(projectId)` before passing it down to the runner; wraps every mutating channel with `withBroadcastOnError` so a handler-level throw broadcasts on `analyzeConvo:event`.

## IPC channels

- `analyzeConvo:start` — kick off a new run for `(projectId, sessionId)`. Idempotent: an active run on the same target returns the existing run instead of spawning a duplicate.
- `analyzeConvo:stopRun` — `SIGTERM` the child + collapse `stopped`. Wrapped with `withBroadcastOnError`.
- `analyzeConvo:getRun` — registry lookup by runId.
- `analyzeConvo:sendUserMessage` — pivot the analysis ("focus on cache compaction"); resolves the run's stored `providerProjectDir` from extras.
- `analyzeConvo:finish` — user-acknowledged completion: cleanup workdir + drop the entry. Cached report under `~/.nakiros/analyses/` survives.
- `analyzeConvo:listActive` / `analyzeConvo:listAll` — registry listings used by the runs-center drawer.
- `analyzeConvo:getBufferedEvents` — replay buffer for the current turn (used by the frontend on remount mid-run).

Broadcasts `analyzeConvo:event` via `eventBus.broadcast` while runs are active.

## Exports

### `analyzeConvoHandlers`

```ts
export const analyzeConvoHandlers: HandlerRegistry
```

The handler bundle merged into the final registry by `buildHandlerRegistry`. Each entry is wrapped via `createTypedHandler` so call sites see typed parameters (no `args[N] as T` casts).
