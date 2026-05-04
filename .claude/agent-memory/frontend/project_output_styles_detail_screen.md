---
name: OutputStyleDetailScreen — detail screen pour output styles
description: OutputStyleDetailScreen 3-onglets (Edit/Audit/Fix) dans views/output-styles/, navigation via OutputStylesScreen orchestrateur, carte Output styles dans ProjectOverviewScreen
type: project
---

`OutputStyleDetailScreen` calqué ligne par ligne sur `RuleDetailScreen`.

**Localisation** : `apps/frontend/src/views/output-styles/OutputStyleDetailScreen.tsx`

**Navigation** : `OutputStylesScreen` (dans `views/OutputStylesScreen.tsx`) orchestrateur avec états `list | create | edit | detail`. Click sur une carte → mode `detail`.

**styleName = filename relatif** depuis `.claude/output-styles/` (ex: `minimal.md`). Attention : `OutputStyleEntry.name` (Module 3 V2 legacy) est le display name, PAS le filename. Toujours passer `s.relativePath.replace(/^\.claude\/output-styles\//, '')` depuis `OutputStylesList.tsx`.

**Sidebar Edit spécifique** : métriques tokens/lignes/sections + frontmatter (name/description/keep-coding-instructions) + quality checks (hasRole/noRole/descriptionTooShort/bodyTooShort).

**IPC utilisés** : `outputStyles:list / read / save / delete / listAudits / readAudit`

**Types** : `OutputStylesRunMode`, `OutputStylesAuditHistoryEntry` (dans `packages/shared/src/types/claude-config.ts`). NB : `OutputStylesAuditHistoryEntry` n'a PAS de champ `score` (contrairement à `RulesAuditHistoryEntry`).

**i18n** : namespace `output-styles-runner` (distinct de `output-styles` Module 3). Enregistré dans `i18n/index.ts`.

**NewShell** : `OutputStylesScreen` reçoit maintenant `onOpenRunTab={handleOpenRunByIds}`.

**ProjectOverview** : carte Output styles avec icône `Sliders`, count via `listOutputStyles`, navigue vers `'outputStyles'`.
