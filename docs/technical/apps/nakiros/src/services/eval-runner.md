# eval-runner.ts

**Path:** `apps/nakiros/src/services/eval-runner.ts`

The main eval runner. Owns the full lifecycle: parse `evals.json`, allocate an iteration number, prepare a sandbox per run (git worktree when the skill lives inside a repo, tmp sandbox otherwise), spawn `claude --print` with a bounded concurrency queue, consume the stream, collect outputs, grade every assertion (deterministic `script` + LLM `llm` batched), persist `run.json` / `grading.json` / `timing.json` / `diff.patch` / `outputs/`, then aggregate the iteration's `benchmark.json` at the end of the batch.

Supports both `autonomous` (single `--print` turn) and `interactive` (multi-turn via `--resume`, transitions to `waiting_for_input` between turns, finalised manually or when all expected output files appear) execution modes.

Comparison runs reuse this runner with `artifactRootOverride`, `skipBenchmarkWrite`, and `fixedIteration` to route artefacts into `evals/comparisons/<ts>/<model>/…` instead of the workspace iteration tree.

## Exports

### `interface StartRunsOptions`

Options for `startEvalRuns`. `artifactRootOverride`, `skipBenchmarkWrite`, and `fixedIteration` are internal — used by the comparison runner to route artefacts and skip benchmark writing.

### `function startEvalRuns`

Start a batch of eval runs for a skill. Runs execute with bounded concurrency (`maxConcurrent`, default 4). Returns immediately with the iteration number and the list of `runIds` created.

```ts
export async function startEvalRuns(
  request: StartEvalRunRequest,
  options: StartRunsOptions,
): Promise<StartEvalRunResponse>
```

**Throws:** `Error` — when the skill directory or `evals.json` is missing.

### `function sendUserMessage`

Send a user message to a run that is `waiting_for_input` (interactive mode). Re-points the event log and executes one claude turn via `--resume`. After the turn, finalises the run (when all expected output files exist) or transitions back to `waiting_for_input`.

```ts
export async function sendUserMessage(
  runId: string,
  message: string,
  skillDir: string,
  definition: SkillEvalDefinition,
  onEvent: (event: EvalRunEvent) => void,
): Promise<void>
```

### `function finishWaitingRun`

Manually finish a run that is `waiting_for_input`. Used when the eval tests "the agent should NOT do X" — the operator confirms and clicks Finish.

```ts
export async function finishWaitingRun(runId: string, definition: SkillEvalDefinition): Promise<void>
```

### `function listRuns`

List every in-memory eval run.

```ts
export function listRuns(): SkillEvalRun[]
```

### `function getRun`

Look up an eval run by id. Returns `null` when unknown.

```ts
export function getRun(runId: string): SkillEvalRun | null
```

### `function getEvalBufferedEvents`

Return the buffered stream events for the current (in-flight) turn of an eval run. Used on remount mid-run.

```ts
export function getEvalBufferedEvents(runId: string): EvalRunEvent['event'][]
```

### `function stopRun`

Cancel an in-flight eval run. Preserves partial artefacts (`outputs/`, `diff.patch`) so the user can inspect what the agent managed to do before interruption.

```ts
export function stopRun(runId: string): void
```

### `function loadPersistedRuns`

Load all runs from a skill's workspace iterations into the in-memory registry. Called by `eval:loadPersisted` on project open so the UI sees historical runs alongside live ones.

```ts
export function loadPersistedRuns(skillDir: string): SkillEvalRun[]
```

Boot-rehydration policy (token-cost survival across daemon restarts):

- `completed` / `failed` / `stopped` → returned read-only.
- `waiting_for_input` → injected into the registry with the saved `sessionId` so {@link sendUserMessage} can resume via `--resume` after a reboot.
- `queued` / `starting` / `running` / `grading` → collapsed to `stopped` (the subprocess died with the previous daemon) and the collapse is persisted to disk so subsequent reloads stay stable.
- Already-registered runs (in-flight) are returned as-is — memory wins over disk.

The rehydration is **lazy**: triggered when the frontend opens an eval view (which calls `eval:loadPersisted`), not at daemon boot. The runs-center drawer therefore populates eval entries as the user navigates between skills. No data is lost — everything is on disk.
