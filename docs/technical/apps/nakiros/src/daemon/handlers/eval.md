# eval.ts

**Path:** `apps/nakiros/src/daemon/handlers/eval.ts`

Registers the `eval:*` IPC channels — the full eval runner surface (lifecycle, streaming, artefacts, feedback, matrix, single-iteration artefact load). Run events are broadcast on `eval:event`.

## IPC channels

### Lifecycle
- `eval:startRuns` — starts a batch of eval runs; returns `{ iteration, runIds }`
- `eval:stopRun` — stops one run
- `eval:listRuns` — every in-memory run
- `eval:loadPersisted` — rehydrates runs from a skill's `evals/workspace/`
- `eval:finishRun` — completes a run waiting on user input (interactive mode)

### Stream
- `eval:sendUserMessage` — forwards a user message to an interactive run
- `eval:getBufferedEvents` — initial backfill so a late WS subscriber catches up

### Feedback
- `eval:getFeedback` — read iteration-level feedback from disk
- `eval:saveFeedback` — persist feedback for one eval in one iteration

### Outputs
- `eval:listOutputs` — walk a run's `outputs/` tree (metadata only)
- `eval:readOutput` — read one output file (refuses path escapes)
- `eval:readDiffPatch` — git diff captured from the run's sandbox (null when the run didn't use a sandbox)

### Matrix
- `eval:getMatrix` — aggregated Evolution view (every iteration for a skill)
- `eval:loadIterationRun` — full artefact bundle (`run.json`, `grading.json`, outputs, `diff.patch`, `timing.json`) for one cell

## Broadcasts

- `eval:event` — streams `status`, `text`, `tool`, `tokens`, `waiting_for_input`, `done` events while a run is active.

## Exports

### `const evalHandlers`

```ts
export const evalHandlers: HandlerRegistry
```
