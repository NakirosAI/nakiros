# bootstrap-runner.ts

**Path:** `apps/nakiros/src/services/bootstrap-runner.ts`

Bootstrap runner — the interactive plan → discuss → approve → execute lifecycle for the Project `.claude` Bootstrap feature (`docs/redesign/features/project-bootstrap.md`). Modeled directly on `audit-runner.ts` (same worktree strategy, same `dot-claude-snapshot.json` injection, same `waiting_for_input` streaming, now the same shared [`buildChatTimeline`](./runner-core/chat-timeline-builder.md)), with a bootstrap-specific delta: no progress-polling timer (the `nakiros-project-bootstrap` skill writes a single `plan.json` once per turn instead of an incremental manifest/jsonl pair), two extra resting states (`awaiting_approval`, `executing`, added to the shared `RunStatus` union in `runner-core/runner.ts`), optional friction-digest enrichment, and an execution phase (`approveBootstrapPlan` → internal `dispatchApprovedProposals`) that delegates the actual per-entity writes to [`bootstrap-dispatch.ts`](./bootstrap-dispatch.md) — writes target `run.projectPath` (the real project), never `run.cwd` (the worktree).

Post-code-review hardening (all internal to `spec`, not separately exported):
- **`onTurnComplete`** keeps the run in `awaiting_approval` (not `waiting_for_input`) for any turn that leaves an already-existing `plan.json` unchanged — only a genuinely plan-less first turn waits. Otherwise a clarifying-question turn used to demote the run out of `awaiting_approval`, and `approveBootstrapPlan` couldn't be called from `waiting_for_input`.
- **`cleanupOnTerminal`** archives `run.plan` (+ a small run summary) to `~/.nakiros/<projectId>/bootstrap-plans/<runId>/` before deleting the workdir, whenever the run has a plan and its status isn't `completed` — mirrors `audit-runner`'s archive-before-delete for `audit-report.md`. Otherwise a one-click Stop from the dock would `rmSync` the workdir, the plan's only persistence, with no rescue.
- **`rehydrate`** maps a persisted `executing` status to `failed` with an explanatory error + `interruptedByReboot: true` (a daemon crash mid-dispatch has no partial-progress checkpoints — resuming verbatim would wedge the run forever). It also drops a `cwd` that no longer exists on disk (worktree swept or otherwise removed) rather than restoring a dead path that would `ENOENT` a future turn spawn — `executeTurn` falls back to `workdir` (always present), and approval/dispatch never depend on `cwd` anyway.

## Exports

### `function restoreOrCleanupBootstrapWorkdirs`

Boot recovery. Scans `~/.nakiros/runs/bootstrap/*` and rehydrates or cleans up.

```ts
export function restoreOrCleanupBootstrapWorkdirs(): void
```

### `function listActiveBootstrapRuns`

List all active (non-terminal) bootstrap runs — lightweight payload, see `toListSummary` (module-private): `plan` is `null`, `turns` is `[]`, `proposalCount` is populated instead. A 2-second dock poll only needs scalars; the full `plan` (every proposal's content) and `turns` (the whole conversation) were being serialized every poll for no reason. `getBootstrapRun` and the event stream still carry the real `plan`/`turns`.

```ts
export function listActiveBootstrapRuns(): BootstrapRun[]
```

### `function listAllBootstrapRuns`

List every bootstrap run currently held in memory — active and terminal. Same lightweight payload as `listActiveBootstrapRuns`.

```ts
export function listAllBootstrapRuns(): BootstrapRun[]
```

### `function getResumableBootstrapWorktreePaths`

Absolute worktree paths (`cwd`) of bootstrap runs still in an active (resumable) status. Passed into the boot-time `sweepOrphanSandboxes` keep-set (unioned with eval's `getResumableSandboxPaths()` in `server.ts`) so a worktree a rehydrated run still references isn't destroyed out from under it.

```ts
export function getResumableBootstrapWorktreePaths(): Set<string>
```

### `function startBootstrap`

Start (or resume) a bootstrap run for `request.projectId`. Idempotent per project — a second `start()` call while one is already active re-points the event log and returns the existing run without spawning a new subprocess.

```ts
export function startBootstrap(request: StartBootstrapRequest, opts: { skillDir: string; onEvent(event: BootstrapRunEvent): void }): BootstrapRun
```

### `function sendBootstrapUserMessage`

Forward a user message to a bootstrap run that's `waiting_for_input` or `awaiting_approval` — the discussion step of the plan → discuss → approve → execute lifecycle.

```ts
export async function sendBootstrapUserMessage(runId: string, message: string, opts: { onEvent(event: BootstrapRunEvent): void }): Promise<void>
```

**Throws:** `Error` — when the run is unknown or not accepting input.

### `function approveBootstrapPlan`

Apply the user's per-proposal decisions, move the run into `executing`, then dispatch every accepted proposal to its per-entity writer via the internal `dispatchApprovedProposals` (which delegates to `dispatchBootstrapPlan` in `bootstrap-dispatch.ts`). By the time this function returns, the run has already reached its final `completed` (or `failed`, if dispatch itself crashed before processing anything) status — dispatch is synchronous.

Any proposal absent from `request.decisions` and still `pending` is promoted to `accepted` before dispatch — `pending` means "implicitly included in execution" per the plan-format contract, matching the UI's default-checked checkbox semantics. Accepts the run in either `awaiting_approval` or `waiting_for_input` as long as a plan exists (defense in depth alongside the `onTurnComplete` fix above).

```ts
export function approveBootstrapPlan(request: ApproveBootstrapPlanRequest, opts: { onEvent(event: BootstrapRunEvent): void }): BootstrapRun
```

**Throws:** `Error` — when the run is unknown, has no plan yet, or isn't `awaiting_approval`/`waiting_for_input`.

### `function stopBootstrap`

Cancel an in-flight bootstrap run: `SIGTERM` the child (no-op once resting in `awaiting_approval`/`executing`, where there is none), collapse status to `stopped`, archive the plan (see `cleanupOnTerminal` above) and tear down the workdir + worktree. No-op when unknown.

```ts
export function stopBootstrap(runId: string): void
```

### `function finishBootstrap`

User-acknowledged completion. Tears down the workdir + worktree and removes the entry from the registry. No archive needed here — the run is `completed`, so `cleanupOnTerminal`'s archive-on-stop guard skips it (the approved, executed plan already lives on `run.plan`, persisted with each proposal's final `written`/`failed`/`rejected` status).

```ts
export function finishBootstrap(runId: string): void
```

### `function getBootstrapRun`

Look up a bootstrap run by id. Returns `null` when unknown.

```ts
export function getBootstrapRun(runId: string): BootstrapRun | null
```

### `function getBootstrapBufferedEvents`

Return the buffered stream events for the current (in-flight) turn.

```ts
export function getBootstrapBufferedEvents(runId: string): BootstrapEvent[]
```

### `function getBootstrapTimeline`

Build the bootstrap-conversation timeline directly from Claude Code's session jsonl. Delegates to the shared [`buildChatTimeline`](./runner-core/chat-timeline-builder.md) (runner-core) — universal `user` / `assistant_text` / `tool` kinds, filtering out the agent's `Write` to `plan.json` (already streamed via the `plan_updated` event). Returns an empty array when the run has no sessionId yet or the file is missing.

```ts
export function getBootstrapTimeline(runId: string): BootstrapTimelineEntry[]
```

### `function getBootstrapUsage`

Compute the billed-equivalent + agent-active stats for a bootstrap run. Delegates to `computeSessionUsage` — same algorithm as audit/fix/eval.

```ts
export function getBootstrapUsage(runId: string): FixUsage
```
