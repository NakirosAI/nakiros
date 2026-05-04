---
name: permissions-expert wired 2026-05-04 (scope toggle added same day)
description: nakiros-permissions-expert wired as singleton then extended with project/local scope toggle
type: project
---

`nakiros-permissions-expert` wired 2026-05-04. Originally singleton (hooks-expert pattern). Extended same day with scope toggle (project/local).

**Key naming collision**: `PermissionsMutationResult` already exists in claude-config.ts (Module 4 V2 form editor). Expert save result named `PermissionsExpertMutationResult`.

New types (scope toggle extension):
- `PermissionsExpertScope = 'project' | 'local'` in project.ts — NOT `PermissionsScope` (that already exists in claude-config.ts Module 4).
- `PermissionsTargetContext.scope: PermissionsExpertScope` added.
- `PermissionsRunTarget.scope: PermissionsExpertScope` added.
- `PermissionsExpertScope` re-exported from agent-run.ts.

IPC handlers: all 3 mutable channels now accept `scope` as second arg: `permissions:read(projectId, scope)`, `permissions:save(projectId, scope, content, mtimeAtRead)`, `permissions:listAudits(projectId, scope)`. Handler uses a `toScope(raw)` helper coercing unknown to valid scope. `permissions:readAudit(path)` unchanged.

Services:
- `permissions-writer.ts`: `readPermissionsBlock(projectPath, scope)` / `savePermissionsBlock(projectPath, scope, ...)` — `scope=local` targets `settings.local.json`.
- `permissions-audit-history.ts`: `permissionsAuditArchiveDir(projectId, scope)` / `listPermissionsAudits(projectId, scope)` — archives under `~/.nakiros/<id>/permissions-audits/<scope>/audit-<ISO>.md`.

Runners: `findActiveForTarget` matches on (projectId, scope) — two scopes may coexist. `buildFirstPrompt` mentions which settings file is targeted. Archive uses `pt.scope ?? 'project'`.

Frontend bridge: all 3 methods get `scope` param. `launchPermissions` accepts `scope`. `useAgentRunsSync` adds `(local)` suffix in title + propagates scope in target. `run-display.ts` adds `(local)` suffix. `usePermissionsFile(projectId, scope)` accepts scope. `PermissionsScreen` has 2-pill toggle + `handleScopeChange` resets selectedAudit + loadAudits/launchPermissions scope-aware. `ProjectOverviewScreen` fetches both scopes, displays total + "X project · Y local" subtitle via `ConfigCard.subtitle?`.

i18n: `scope.project/local` + `scopeTooltip.project/local` keys in `permissions-runner.json`.

**Why:** `PermissionsExpertScope` is distinct from `PermissionsScope` (Module 4) — use the right one!
