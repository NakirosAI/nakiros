# shell.ts

**Path:** `apps/nakiros/src/daemon/handlers/shell.ts`

Registers the `shell:*` IPC channels for OS-level actions triggered from the UI.

## IPC channels

- `shell:openPath` — opens a file or URL with the OS default handler (via the `open` package). Silently no-ops when `path` is missing.

## Exports

### `const shellHandlers`

```ts
export const shellHandlers: HandlerRegistry
```
