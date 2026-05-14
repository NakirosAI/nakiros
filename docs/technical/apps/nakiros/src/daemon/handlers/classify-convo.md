# classify-convo.ts

**Path:** `apps/nakiros/src/daemon/handlers/classify-convo.ts`

Registers the `classifyConvo:*` IPC channels that drive the V1.1 friction-classification
pipeline for a single Claude Code session. The run lifecycle mirrors `analyzeConvo:*` so the
frontend can share the same RunSidePanel consumer pattern without dedicated adapters.

## IPC channels

- `classifyConvo:start` — start a new classify-convo run for a given `projectId` + `sessionId`
- `classifyConvo:stopRun` — stop an active run; broadcasts a terminal event on `classifyConvo:event`
- `classifyConvo:getRun` — fetch the current state of a run by runId
- `classifyConvo:finish` — mark a waiting-for-input run as complete
- `classifyConvo:sendUserMessage` — send a follow-up message into an interactive run
- `classifyConvo:listActive` — list all currently running classify-convo runs
- `classifyConvo:listAll` — list all classify-convo runs (including completed/failed)
- `classifyConvo:getBufferedEvents` — flush events buffered since last poll

Broadcasts:
- `classifyConvo:event` — streamed during every active run via `eventBus.broadcast`

## Exports

### `classifyConvoHandlers`

```ts
export const classifyConvoHandlers: HandlerRegistry
```

Handler map keyed by `IpcChannel`. Merged into the global registry by `buildHandlerRegistry()`.
Each handler delegates to the corresponding function in `classify-convo-runner.ts`, resolving
the project from `getProject(projectId)` before dispatching.
