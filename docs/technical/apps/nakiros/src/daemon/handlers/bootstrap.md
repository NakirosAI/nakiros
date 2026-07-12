# bootstrap.ts

**Path:** `apps/nakiros/src/daemon/handlers/bootstrap.ts`

Registers the `bootstrap:*` IPC channels — the interactive plan → discuss → approve → execute lifecycle for the Project `.claude` Bootstrap feature (`docs/redesign/features/project-bootstrap.md`). Mirrors the `audit:*` handler surface; `approvePlan` is the one bootstrap-specific addition.

## IPC channels

- `bootstrap:start` — resolves the bundled `nakiros-project-bootstrap` skill directory and starts (or resumes) a bootstrap run for the given project.
- `bootstrap:stopRun` — cancels an in-flight run.
- `bootstrap:getRun` — looks up a run by id.
- `bootstrap:finish` — user-acknowledged completion; tears down the workdir + worktree.
- `bootstrap:sendUserMessage` — forwards a discussion message (accepted while `waiting_for_input` or `awaiting_approval`).
- `bootstrap:approvePlan` — applies per-proposal accept/reject/edit decisions and moves the run to `executing`.
- `bootstrap:listActive` — lists active (non-terminal) runs.
- `bootstrap:listAll` — lists every run held in memory, active and terminal.
- `bootstrap:getBufferedEvents` — replay buffer for the in-flight turn.
- `bootstrap:getTimeline` — conversation timeline derived from the session jsonl.
- `bootstrap:getUsage` — billed-equivalent usage stats.

**Broadcasts:**
- `bootstrap:event` — pushed via `eventBus.broadcast` while a run is active, and on handler failure (`withBroadcastOnError`).

## Exports

### `bootstrapHandlers`

The `HandlerRegistry` map for all `bootstrap:*` channels, merged into the daemon's registry by `handlers/index.ts`.

```ts
export const bootstrapHandlers: HandlerRegistry
```
