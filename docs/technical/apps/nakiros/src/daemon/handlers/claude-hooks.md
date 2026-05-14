# claude-hooks.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-hooks.ts`

Registers `claudeHooks:*` channels for the Module 6 V2 hooks editor. Edits only the `hooks`
block inside `settings.json` / `settings.local.json`; all other keys are round-tripped via the
opaque `preservedJson` field so the Permissions and Hooks tabs can safely co-write the same
file without trampling each other's changes.

**Note:** These channels are distinct from `hooks:*` (the `nakiros-hooks-expert` audit/fix flow).

## IPC channels

- `claudeHooks:read` — returns `HooksFileContent` (parsed hooks + preserved blob + mtime) for the given scope
- `claudeHooks:save` — merge-save an updated hooks block; returns `HooksMutationResult`

## Exports

### `claudeHooksHandlers`

```ts
export const claudeHooksHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
