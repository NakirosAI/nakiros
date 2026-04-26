# runner.ts

**Path:** `apps/nakiros/src/services/runner-core/runner.ts`

Kind-agnostic lifecycle backbone for Nakiros runners. The factory `createRunner(spec)` owns the registry, the `claude` turn execution, EventLog wiring, persistence, and boot rehydration. Each kind (audit / fix / create) supplies a small {@link RunnerSpec} contributing only the differences: workdir prep, first-turn prompt, post-turn policy, finish, cleanup. **eval-runner is intentionally NOT migrated** onto this factory — its batch + sandbox + grading model diverges too sharply (per-run lifecycle vs N-runs-in-batch + async grading + executionDir ≠ workdir).

## Exports

### `type RunStatus`

```ts
export type RunStatus =
  | 'queued' | 'starting' | 'running'
  | 'waiting_for_input' | 'grading'
  | 'completed' | 'failed' | 'stopped';
```

Shared lifecycle status union. Audit / fix / create use the narrow subset (no `queued` / `grading`); eval extends with both — it doesn't run on this factory but the type stays inclusive so a future migration is type-compatible.

### `interface BaseTurn`

```ts
export interface BaseTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: { name: string; display: string }[];
  blocks?: Array<{ type: 'text'; text: string } | { type: 'tool'; name: string; display: string }>;
}
```

Turn shape shared by `AuditRunTurn` and `EvalRunTurn` — both are structurally compatible.

### `interface BaseRun`

Minimal contract every run state must satisfy. `AuditRun` / `SkillEvalRun` / `AnalyzeConvoRun` extend this; the factory only relies on these fields. The optional `interruptedByReboot?: boolean` flag is set by `spec.rehydrate` when the last `waiting_for_input` came from a boot-time collapse, and cleared at the very start of `executeTurn` once the user (or the runner) actively drives the run again. Drives the UI's "Reprendre" affordance.

### `interface RunEventEnvelope<TEvent>`

Wrapped event broadcast by every runner — `{ runId, event }`.

### `interface RunOpts<TEvent>`

Live caller-supplied options threaded through every API call. The minimal contract is `{ onEvent }` — kinds that need extra fields (e.g. `skillDir`) wrap this with their own external `RunOpts` and forward through to the factory.

### `interface RunEntry<TRun, TEvent, TExtras>`

Internal registry entry. `extras` carries kind-specific fields the spec needs alongside the run (skillDir, mode, realSkillDir, …).

### `interface PostTurnHelpers<TRun, TEvent, TExtras>`

Helpers passed to `spec.onTurnComplete`. `wait(entry)` transitions to `waiting_for_input`; `complete(entry)` marks `completed`; `fail(entry, error)` marks `failed`. The spec composes them — never re-implements the transitions.

### `type RehydrateResult<TRun, TExtras>`

```ts
export type RehydrateResult<TRun, TExtras> =
  | { kind: 'rehydrate'; run: TRun; extras: TExtras }
  | { kind: 'cleanup'; reason?: string };
```

Outcome of `spec.rehydrate(persisted, workdir)` at boot — keep the run or wipe its workdir.

### `interface RunnerSpec<TRun, TStartReq, TEvent, TExtras>`

Kind-specific contract a runner instance is built from. Required hooks: `kind`, `runsRoot`, `prepareWorkdir`, `buildFirstPrompt`, `createInitialRun`, `onTurnComplete`, `cleanupOnTerminal`. Optional hooks:

- `runIdPrefix(req)` — override the run-id prefix per request (e.g. fix vs create).
- `buildCliArgs(prompt, entry, isFirstTurn)` — override `claude` argv (e.g. fix passes `skipPermissions: true`, eval passes `addDirs` + `model`).
- `onTurnFailed(entry)` — extra cleanup on a failed turn (fix immediately destroys the temp workdir; audit keeps it for review).
- `finish(entry, opts)` — kind-specific work on user-confirmed completion (fix syncs back; audit is a no-op because the artefact was already archived during `onTurnComplete`).
- `findActiveForTarget(req, registry)` — idempotence: when a non-terminal run already exists for the same target, `start` rebinds instead of spawning.
- `canSendUserMessage(entry)` — gate for `sendUserMessage`. Default: `status === 'waiting_for_input'`.
- `rehydrate(persisted, workdir)` — boot rehydration policy.
- `emitOnRebind(entry, opts)` — broadcast a synthetic event when the live listener rebinds (e.g. surface the current status).

### `interface RunnerInstance<TRun, TStartReq, TEvent, TExtras>`

Public surface: `start`, `sendUserMessage`, `stop`, `finish`, `getRun`, `listActive`, `listAll`, `getBufferedEvents`, `registry()` (read-only view), `restoreOrCleanup(broadcast)`.

### `function createRunner`

```ts
export function createRunner<TRun extends BaseRun, TStartReq, TEvent, TExtras>(
  spec: RunnerSpec<TRun, TStartReq, TEvent, TExtras>,
): RunnerInstance<TRun, TStartReq, TEvent, TExtras>
```

Build a runner instance from the spec. The factory wires:

1. **Registry** — `Map<runId, RunEntry>` shared across the public methods.
2. **Idempotent `start`** — calls `spec.findActiveForTarget?` first; on miss, runs `prepareWorkdir`, `createInitialRun`, persists, kicks off the first turn fire-and-forget, returns the run synchronously.
3. **`executeTurn`** — resets the EventLog, clears `run.interruptedByReboot`, transitions `starting → running`, builds CLI args (via `spec.buildCliArgs?` or default), spawns `claude --print`, dispatches text / tool / usage events through the EventLog, pushes user + assistant turns, and on a failed turn emits `done` and calls `spec.onTurnFailed?`. The `onSession` callback persists `run.json` immediately on receiving the Claude session id — without this, a daemon kill mid-turn would leave `run.json` with `sessionId: null` and rehydrate would have no way to `--resume`. After a successful turn, dispatches `spec.onTurnComplete(entry, helpers)` so the kind decides whether to wait, complete, or fail.
4. **`sendUserMessage`** — gates via `spec.canSendUserMessage` (default `waiting_for_input`), rebinds the EventLog to the new caller, calls `executeTurn`, then `spec.onTurnComplete` again.
5. **`stop`** — `SIGTERM`s the child, transitions `stopped`, broadcasts `done` (exitCode 130), destroys the EventLog, calls `spec.cleanupOnTerminal`. Entry stays in the registry for the UI to render.
6. **`finish`** — calls `spec.finish?`, then `spec.cleanupOnTerminal`, then removes the entry from the registry. Used by the UI's "Terminer" / "Sync" / "Create" buttons.
7. **`restoreOrCleanup(broadcast)`** — boot scan: for each persisted workdir under `runsRoot()`, calls `spec.rehydrate(persisted, workdir)` and either re-injects a `RunEntry` (with the EventLog restored from `events.jsonl`) or wipes the workdir.
