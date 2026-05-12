# meta.ts

**Path:** `apps/nakiros/src/daemon/handlers/meta.ts`

Registers the `meta:*` IPC channels for app-level metadata queries (version info, changelog).

## IPC channels

- `meta:getVersionInfo` — returns current installed version + latest npm version. Optional `{ force: true }` in the first arg bypasses the in-memory cache.
- `meta:getChangelog` — returns the full content of `CHANGELOG.md` and the running daemon version. Falls back to `{ markdown: '', version }` when the file cannot be located.

## Exports

### `const metaHandlers`

Handler bundle registered by `buildHandlerRegistry`. Owns two channels: `meta:getVersionInfo` and `meta:getChangelog`.

```ts
export const metaHandlers: HandlerRegistry
```
