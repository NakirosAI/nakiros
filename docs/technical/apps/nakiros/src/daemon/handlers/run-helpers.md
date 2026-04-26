# run-helpers.ts

**Path:** `apps/nakiros/src/daemon/handlers/run-helpers.ts`

Cross-handler helpers used by every IPC handler file: a typed broadcaster factory, a "run or throw" lookup wrapper, a skill-directory resolver taking the minimal `SkillRunIdentity` shape every run exposes, and a generic `createTypedHandler` adapter that lifts a typed function into the raw `IpcHandler` shape the registry expects.

## Exports

### `function createEventBroadcaster`

Build a typed broadcaster that pushes events onto `eventBus` under the canonical channel name from `IPC_CHANNELS`. Returned function is passed as the `onEvent` callback to runners so they never reference channel strings.

```ts
export function createEventBroadcaster<T>(channel: IpcChannel): (event: T) => void
```

### `function getRunOrThrow`

Fetch a run by id via `getter`, throwing a contextual error if it's not found. Wraps the common "look up by runId or 404" pattern used by every handler that mutates an in-flight run.

```ts
export function getRunOrThrow<T>(
  getter: (runId: string) => T | null | undefined,
  runId: string,
  label: string,
): T
```

**Throws:** `Error` — when `getter(runId)` returns null or undefined (`{label} run not found: {runId}`).

### `interface SkillRunIdentity`

Minimal identity fields shared by every run kind — enough to resolve the skill directory.

```ts
export interface SkillRunIdentity {
  scope: StartEvalRunRequest['scope'];
  projectId?: string;
  skillName: string;
  pluginName?: string;
  marketplaceName?: string;
}
```

### `function resolveSkillDirForRun`

Resolve the on-disk skill directory for a run, delegating to `resolveSkillDir`. Used by audit/fix/create handlers to turn a `SkillRunIdentity` back into the original skill path.

```ts
export function resolveSkillDirForRun(run: SkillRunIdentity): string
```

### `function createTypedHandler`

Adapter that lifts a typed `(...args: TArgs) => TResult` function into the raw `IpcHandler` shape (`(args: unknown[]) => unknown`) the registry expects. Replaces the boilerplate `args[0] as T`, `args[1] as U`… casts that used to live in every handler. The cast `unknown[] → TArgs` is unsafe by construction (the IPC layer cannot prove the caller passed the right shape), but it's localised here and the handler body sees properly typed parameters. Callers needing runtime validation should keep doing it explicitly inside the handler body.

```ts
export function createTypedHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): (rawArgs: unknown[]) => TResult | Promise<TResult>
```

**Example:**
```ts
'audit:stopRun': createTypedHandler(stopAudit),
'audit:sendUserMessage': createTypedHandler(async (runId: string, message: string) => {
  // …
}),
```
