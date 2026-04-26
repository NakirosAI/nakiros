# analyze-convo-runner.ts

**Path:** `apps/nakiros/src/services/analyze-convo-runner.ts`

Streaming deep-analysis runner — promotes the legacy one-shot `runDeepAnalysis` (synchronous Promise that returned the markdown report) into a first-class agent run via `createRunner`. The agent is instructed to write the final markdown report to `outputs/deep-analysis.md` inside the run workdir; once that file lands the runner archives it into `~/.nakiros/analyses/<sessionId>.json` (so `loadConversationDeepAnalysis` keeps working) and marks the run completed.

Reuses the prompt-building + model-routing helpers exported by `conversation-deep-analyzer.ts` (`buildAnalyzeConvoPrompt`, `estimatePromptTokens`, `analysisFilePath`, `persistAnalysis`, `HAIKU_MODEL`, `SONNET_MODEL`, `HAIKU_INPUT_BUDGET`, `MAX_PROMPT_TOKENS`).

## Exports

### `function restoreOrCleanupAnalyzeConvoWorkdirs`

Boot-time scan of `~/.nakiros/runs/analyze-convo/*` — rehydrates persisted runs (collapsing active runs without a session file to `stopped`, marking active-with-session as `waiting_for_input` + `interruptedByReboot=true`) or cleans up terminal workdirs.

```ts
export function restoreOrCleanupAnalyzeConvoWorkdirs(): void
```

### `function listActiveAnalyzeConvoRuns`

List every in-memory run that's still in a non-terminal status. Powers the runs-center drawer's "active" section.

```ts
export function listActiveAnalyzeConvoRuns(): AnalyzeConvoRun[]
```

### `function listAllAnalyzeConvoRuns`

List every run currently held in memory — active and terminal — so the drawer can also surface completed runs the user can re-open or dismiss.

```ts
export function listAllAnalyzeConvoRuns(): AnalyzeConvoRun[]
```

### `function startAnalyzeConvo`

Start (or resume) a deep-analysis run for `(projectId, sessionId)`. Idempotent: an active run on the same target rebinds its event log to the new caller instead of spawning. Builds the prompt + picks the model (Haiku ≤ 170k tokens, Sonnet otherwise) at this point; both are cached on the entry's `extras` so resume turns reuse them.

```ts
export function startAnalyzeConvo(request: StartAnalyzeConvoRequest, opts: RunOpts): AnalyzeConvoRun
```

**Throws:** `Error` — when the conversation is unreadable or the prompt would exceed Sonnet's 1M window.

### `function sendAnalyzeConvoUserMessage`

Forward a user message to a run that's `waiting_for_input` ("focus on cache compaction"). Re-points the event log, executes one claude turn via `--resume`, then either archives the updated report on success or transitions back to `waiting_for_input`.

```ts
export async function sendAnalyzeConvoUserMessage(runId: string, message: string, opts: RunOpts): Promise<void>
```

### `function stopAnalyzeConvo`

Cancel an in-flight run: `SIGTERM` the child, collapse to `stopped`, tear down the workdir + event log. The entry stays in the registry so the UI can keep rendering the stopped run until the user dismisses it.

```ts
export function stopAnalyzeConvo(runId: string): void
```

### `function finishAnalyzeConvo`

User-acknowledged completion. Tears down the workdir + event log and removes the entry from the registry. The cached report under `~/.nakiros/analyses/` is preserved (re-readable via `loadConversationDeepAnalysis`).

```ts
export function finishAnalyzeConvo(runId: string): void
```

### `function getAnalyzeConvoRun`

Look up a run by id. Returns `null` when unknown.

```ts
export function getAnalyzeConvoRun(runId: string): AnalyzeConvoRun | null
```

### `function getAnalyzeConvoBufferedEvents`

Return the buffered stream events for the current (in-flight) turn. Used by the frontend on remount mid-run so the live activity panel re-populates instead of appearing empty.

```ts
export function getAnalyzeConvoBufferedEvents(runId: string): AnalyzeConvoRunEvent['event'][]
```

### `function getAnalyzeConvoProviderDir`

Return the run's stored `providerProjectDir` (from extras). Used by the IPC handler so the resume path can rebuild the runner `RunOpts` without re-reading the project record.

```ts
export function getAnalyzeConvoProviderDir(runId: string): string | null
```

### `function getAnalyzeConvoWorkdirStats`

Surface the run's workdir + the size of the persisted report file. Used by future diagnostic UI.

```ts
export function getAnalyzeConvoWorkdirStats(runId: string): { workdir: string; sizeBytes: number } | null
```

### `function copyAnalyzeConvoReport`

Copy the canonical cached report (under `~/.nakiros/analyses/`) into `dest`. Used by future export flows.

```ts
export function copyAnalyzeConvoReport(sessionId: string, dest: string): void
```

**Throws:** `Error` — when no cached analysis exists for the given `sessionId`.
