# meta.ts

**Path:** `apps/nakiros/src/daemon/handlers/meta.ts`

Registers the `meta:*` IPC channels for app-level metadata queries.

## IPC channels

- `meta:getVersionInfo` — returns current installed version + latest npm version. Optional `{ force: true }` in the first arg bypasses the in-memory cache.

## Exports

### `const metaHandlers`

Handler bundle registered by `buildHandlerRegistry`.

```ts
export const metaHandlers: HandlerRegistry
```
