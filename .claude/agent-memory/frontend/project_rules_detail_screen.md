---
name: RuleDetailScreen — per-rule 3-onglets
description: Nouveau RuleDetailScreen calqué sur ClaudeMdScreen, avec navigation list→detail dans RulesScreen
type: project
---

`views/rules/RuleDetailScreen.tsx` : écran 3-onglets (Edit/Audit/Fix) per-rule.
- Calqué ligne par ligne sur `ClaudeMdScreen.tsx`
- IPC utilisés : `readRule`, `saveRule`, `deleteRule`, `listRulesAudits`, `readRulesAudit`
- Types : `RulesAuditHistoryEntry` (pas de `sizeBytes`), `RulesRunMode = 'audit'|'fix'|'create'`
- `launchRules({ projectId, projectPath, ruleName, mode })` dans `run-launcher.ts`
- `originalBody` state + effect `[loading]` pour dirty tracking (pas de `file.body` reference directe)
- `extractPathsGlobs()` extrait les globs du frontmatter YAML (inline + block list)
- `RulesScreen.tsx` orchestre list → `{ mode: 'detail', ruleName }` → `RuleDetailScreen`
- `ProjectOverviewScreen.tsx` : prop `onNavigate(view: ProjectTabView)` ajouté + carte Rules via `listRules`
- `NewShell.tsx` : passe `onNavigate={setView}` à ProjectOverviewScreen + `onOpenRunTab` à RulesScreen
- i18n namespace `rules` — nouvelles clés sous `detail.*` (EN+FR)
- i18n namespace `overview` — nouvelles clés `sections.config` et `config.rules` (EN+FR)
