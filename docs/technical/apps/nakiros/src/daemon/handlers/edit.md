# edit.ts

**Path:** `apps/nakiros/src/daemon/handlers/edit.ts`

Registers the `edit:*` IPC channels — user-driven interactive editing of an existing entity
(skill or `.claude/` config). Uses identical machinery to `fix:*` (same `fix-runner.ts`
functions, same tmp_skill sandbox pattern) but the first prompt invites the user to describe
what to change rather than driving from audit findings.

## IPC channels

- Lifecycle: `edit:start`, `edit:stopRun`, `edit:getRun`, `edit:finish`
- Stream: `edit:sendUserMessage`, `edit:listActive`, `edit:getBufferedEvents`
- Evals in temp: `edit:runEvals` — runs the skill's eval suite against the in-progress sandbox; only meaningful for skill edit runs; errors broadcast on `eval:event`
- Diff preview: `edit:listDiff`, `edit:readDiffFile`
- Timeline: `edit:getTimeline`
- Usage: `edit:getUsage` — parses the session JSONL for billed-equivalent cost + agent-active ms

Broadcasts:
- `edit:event` — edit lifecycle events (start, tool calls, finish, error)
- `eval:event` — eval runs launched from the edit temp workdir

## Exports

### `editHandlers`

```ts
export const editHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
