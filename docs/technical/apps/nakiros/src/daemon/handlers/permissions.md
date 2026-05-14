# permissions.ts

**Path:** `apps/nakiros/src/daemon/handlers/permissions.ts`

Registers `permissions:*` channels for the `nakiros-permissions-expert` audit/fix/create flow.
Operates at JSON-string level (the expert rewrites the entire permissions block as raw JSON),
unlike `claudePermissions:*` which provides structured form fields. Scope-aware: targets either
`settings.json` (`'project'`) or `settings.local.json` (`'local'`). A path-traversal guard is
applied to `permissions:readAudit` so only paths under `~/.nakiros/` are served.

**Note:** These channels are DISTINCT from `claudePermissions:*` (Module 4 V2 form editor).

## IPC channels

- `permissions:read` — returns `PermissionsReadResult` (raw JSON string + mtime) for the given scope
- `permissions:save` — merge a new permissions JSON block into the scoped settings file; returns `PermissionsExpertMutationResult`
- `permissions:listAudits` — returns `PermissionsAuditHistoryEntry[]` for `(projectId, scope)`, newest-first
- `permissions:readAudit` — read a single archived audit report; path-traversal guard applied

## Exports

### `permissionsHandlers`

```ts
export const permissionsHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
