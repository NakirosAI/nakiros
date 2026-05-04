---
name: HooksScreen singleton — miroir ClaudeMdScreen
description: HooksScreen est un singleton miroir de ClaudeMdScreen (3 onglets Edit/Audit/Fix, JSON textarea + validation, IPC hooks:read/save/listAudits/readAudit, namespace i18n hooks-runner)
type: project
---

`HooksScreen` (views/HooksScreen.tsx) est le miroir exact de `ClaudeMdScreen` pour le bloc hooks de `.claude/settings.json`.

**Pattern** : singleton (pas de listing), 3 onglets Edit/Audit/Fix identiques à ClaudeMdScreen.

**Différences vs ClaudeMdScreen** :
- Pas de `MarkdownEditor` (Milkdown) — `<textarea>` JSON natif avec validation live
- Badge "Valid JSON" / "Invalid JSON: <message>" au-dessus du textarea
- Sauvegarde désactivée si JSON invalide
- Sidebar : count d'events hooks configurés + liste event/count + warnings (disableAllHooks / missingTimeout / insecureHttp)
- Hook `useHooksFile` dans `views/hooks/useHooksFile.ts` (calqué sur `useClaudeMdFile`)
- IPC: `readHooks` / `saveHooks` / `listHooksAudits` / `readHooksAudit` (via `hooks:read` / `hooks:save` / `hooks:listAudits` / `hooks:readAudit`)
- Types: `HooksReadResult` (`.content` = JSON string, `.mtime`, `.exists`, `.path`) et `HooksExpertMutationResult`
- Distinct du Module 6 hooks editor (`readClaudeHooks` / `saveClaudeHooks`) qui utilise les IPC `claudeHooks:*`

**Toggle Form/JSON** : onglet Edit a un toggle "Formulaire / JSON" (natif `<button>`, n-* tokens). Default mode : `'form'`. Si JSON invalide → force JSON mode (bouton Form disabled). `HooksFormEditor` dans `views/hooks/HooksFormEditor.tsx` gère le form editor. Il parse le JSON en `HookEditEvent[]` via `parseEventsFromJson()` (gère shape flat et nested `{ hooks: [{ type, command }] }`), et sérialise toujours en shape nested `hooks-runner`. Clés nouvelles dans `hooks-runner` : `editTab.form`, `editTab.json`, `editTab.formDisabledTooltip`, `editTab.formCannotRenderInvalid`.

**Namespace i18n** : `hooks-runner` (pas `hooks` qui est pris par le Module 6 editor). Le form editor (`HooksFormEditor`) utilise `hooks` pour les labels d'événements et placeholders (Module 6 bundle conservé).

**NewShell** : `view === 'hooks'` passe `onOpenRunTab={handleOpenRunByIds}` — câblé.

**ProjectOverviewScreen** : carte Hooks avec `readHooks` → parse JSON → count events → `onNavigate('hooks')`. Icône `Webhook` de lucide.

**Warnings sidebar** :
- `disableAllHooks: true` dans le JSON → warning
- Handler sans `timeout` → warning (niveau warn)
- URL `http://` dans un handler → warning (niveau critical)
