# index.ts

**Path:** `apps/nakiros/src/daemon/handlers/index.ts`

Handler registry builder. Every domain-scoped handler file exports its own `xxxHandlers: HandlerRegistry` map; this module merges them all into the final registry consumed by `POST /ipc/:channel`.

**To add a new IPC channel:** declare the channel name in `packages/shared/src/ipc-channels.ts`, create a new `handlers/<domain>.ts` with an `xxxHandlers` map, then add the import + spread here. `CLAUDE.md` enforces these four sites stay aligned.

## Exports

### `type IpcHandler`

Signature every IPC handler must implement — takes an arg array, returns a value or promise.

```ts
export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;
```

### `type HandlerRegistry`

Handler registry shape: a partial record keyed by `IpcChannel`. Partial because individual handler files only register the channels they own; the final registry merges them all.

```ts
export type HandlerRegistry = Partial<Record<IpcChannel, IpcHandler>>;
```

### `function buildHandlerRegistry`

Merge every domain-scoped handler bundle into the final registry. Called once by `createDaemonServer`.

```ts
export function buildHandlerRegistry(): HandlerRegistry
```
