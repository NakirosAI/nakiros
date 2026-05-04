---
name: PermissionsScreen singleton
description: Architecture du PermissionsScreen singleton miroir HooksScreen avec Form/JSON toggle et PermissionsFormEditor extrait du legacy
type: project
---

PermissionsScreen est le singleton miroir exact de HooksScreen (3 onglets Edit/Audit/Fix).

**Fichiers créés :**
- `apps/frontend/src/views/PermissionsScreen.tsx` — singleton principal (remplace le legacy form-only)
- `apps/frontend/src/views/permissions/usePermissionsFile.ts` — hook calqué sur useHooksFile
- `apps/frontend/src/views/permissions/PermissionsFormEditor.tsx` — éditeur form extrait du legacy, réutilise ChipPicker
- `apps/frontend/src/i18n/locales/en/permissions-runner.json` + `fr/permissions-runner.json`

**Namespace i18n :** `permissions-runner` (distinct de `permissions` Module 4 V2)

**IPC utilisés :** `permissions:read` / `permissions:save` / `permissions:listAudits` / `permissions:readAudit`
via `window.nakiros.readPermissions/savePermissions/listPermissionsAudits/readPermissionsAudit`

**Types partagés :** `PermissionsReadResult`, `PermissionsExpertMutationResult`, `PermissionsAuditHistoryEntry`, `PermissionsRunMode`

**PermissionsFormEditor :** parse le JSON → allow/ask/deny (ChipPicker) + defaultMode select + additionalDirectories list.
Fallback si JSON invalide. Préserve les clés inconnues lors de la sérialisation.

**Sidebar Edit :** counts allow/ask/deny + defaultMode affiché + warnings (bypassPermissions, noDeny, bypassNotLocked).

**ProjectOverviewScreen :** carte Permissions (ShieldCheck icon) compte `allow + ask + deny`.
**NewShell :** view === 'permissions' → PermissionsScreen avec onOpenRunTab.

**Why:** Séparation nette entre le Module 4 V2 form-editor (readClaudePermissions/saveClaudePermissions) et l'expert singleton (readPermissions/savePermissions). Même pattern que Hooks pour l'audit/fix/create.
