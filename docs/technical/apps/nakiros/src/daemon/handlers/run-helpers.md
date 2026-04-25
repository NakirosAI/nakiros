# run-helpers.ts

**Path:** `apps/nakiros/src/daemon/handlers/run-helpers.ts`

Cross-handler helpers used by the run-kind handlers (eval / audit / fix / create / comparison): a typed broadcaster factory, a "run or throw" lookup wrapper, and a skill-directory resolver taking the minimal `SkillRunIdentity` shape every run exposes.

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

Resolve the on-disk skill directory for a run, delegating to `resolveEvalSkillDir`. Used by audit/fix/create handlers to turn a `SkillRunIdentity` back into the original skill path.

```ts
export function resolveSkillDirForRun(run: SkillRunIdentity): string
```
