# claude-output-styles.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-output-styles.ts`

Registers `claudeOutputStyles:*` channels for the Module 3 V2 output-styles editor. The list
also reports which style is currently active (built-in or custom) according to the merged
settings files. CRUD operations use `claude-output-styles-writer.ts`.

**Note:** These channels are distinct from `outputStyles:*` (the `nakiros-output-styles-expert`
audit/fix flow).

## IPC channels

- `claudeOutputStyles:list` — returns `OutputStylesListResult` (items + active name + source)
- `claudeOutputStyles:read` — returns `OutputStyleFileContent` for one style
- `claudeOutputStyles:create` — create a new output style; returns `OutputStyleMutationResult`
- `claudeOutputStyles:save` — overwrite a style with mtime guard; returns `OutputStyleMutationResult`
- `claudeOutputStyles:delete` — delete a style; returns `OutputStyleMutationResult`

## Exports

### `claudeOutputStylesHandlers`

```ts
export const claudeOutputStylesHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
