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

Load all runs from a skill's workspace iterations into the in-memory registry. Called by `eval:loadPersisted` on project open so the UI sees historical runs alongside live ones; ALSO called from `restoreEvalRunsForSkillDirs` at daemon boot.

```ts
export function loadPersistedRuns(skillDir: string): SkillEvalRun[]
```

Boot-rehydration policy (token-cost survival across daemon restarts):

- `completed` / `failed` / `stopped` → returned read-only.
- `waiting_for_input` AND the Claude session file still on disk → kept resumable.
- `queued` / `starting` / `running` / `grading` AND a session file on disk → collapsed to `waiting_for_input` + `interruptedByReboot=true` (the user gets a "Reprendre" button).
- Same active states WITHOUT a session file → collapsed to `stopped` (no usable session — Reprendre would surface "No conversation found").
- Already-registered runs (in-flight) are returned as-is — memory wins over disk.

The defensive session-file check looks at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` to ensure `--resume` will actually find the conversation; without this guard a stale `sessionId` would yield "No conversation found with session ID …" when the user clicks Reprendre.

### `function restoreEvalRunsForSkillDirs`

Boot-time scan: replay {@link loadPersistedRuns} on every known skill directory so eval runs from a previous daemon session show up in the runs-center drawer immediately, without the user having to navigate into each skill's eval view first. `skillDirs` is supplied by the caller (server bootstrap) to avoid pulling the project / bundled / global / plugin skill readers into this module. Failures are swallowed per-skill — one corrupt workspace must not block the whole rehydration.

```ts
export function restoreEvalRunsForSkillDirs(skillDirs: string[]): number
```

### `function getResumableSandboxPaths`

Return every sandbox path currently referenced by a registered run that could still be resumed (`status === 'waiting_for_input'`, `executionDir !== workdir`). Passed to `sweepOrphanSandboxes` at boot so the sweep doesn't delete the very sandboxes the user is about to "Reprendre" against — that would yield "No conversation found with session ID …" on `claude --resume`.

```ts
export function getResumableSandboxPaths(): Set<string>
```
