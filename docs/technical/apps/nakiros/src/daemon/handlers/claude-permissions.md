# claude-permissions.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-permissions.ts`

Registers `claudePermissions:*` channels for the Module 4 V2 permissions editor. Splits
`settings.json` / `settings.local.json` into structured permissions fields + a preserved blob
for all other keys.

**Note:** These channels are distinct from `permissions:*` (the `nakiros-permissions-expert`
audit/fix flow that uses JSON-string-level read/save).

## IPC channels

- `claudePermissions:read` — returns `PermissionsFileContent` (structured fields + preserved JSON) for the given scope
- `claudePermissions:save` — merge-save an updated permissions block; returns `PermissionsMutationResult`

## Exports

### `claudePermissionsHandlers`

```ts
export const claudePermissionsHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
