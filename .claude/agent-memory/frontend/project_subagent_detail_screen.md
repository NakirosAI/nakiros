---
name: SubagentDetailScreen — gotchas et pattern
description: Implémentation SubagentDetailScreen et wiring SubagentsScreen, incluant le piège name/extension .md
type: project
---

SubagentDetailScreen créé dans `views/subagents/SubagentDetailScreen.tsx` — calque ligne par ligne de `RuleDetailScreen.tsx`.

**Piège AgentEntry.name :** Le hook legacy `useSubagents` appelle `claudeAgents:list` qui renvoie des `AgentEntry` dont le champ `name` est produit par `stripMdExt()` — c'est le nom **sans extension `.md`** (ex: `backend`). Mais le nouveau handler `subagents:read` / `subagents:save` / `subagents:delete` attend le filename complet **avec `.md`** (ex: `backend.md`). Normalisation faite dans `SubagentsScreen.tsx` au moment du `onOpen` :
```tsx
const normalized = agentName.endsWith('.md') ? agentName : `${agentName}.md`;
setView({ mode: 'detail', agentName: normalized });
```

**Sidebar Edit tab spécifique subagents :** Frontmatter parsé avec `parseSubagentFrontmatter()` (local) — extrait model, description, permissionMode, toolsCount, skillsCount, mcpServersCount, hooksCount. Deux warnings : bypassPermissions (orange) et inheritsAllTools (gris).

**ProjectOverviewScreen :** Carte Subagents ajoutée dans la grille Configuration, count via `window.nakiros.listSubagents(project.id)`, click → `onNavigate('subagents')`. Import `Bot` ajouté.

**NewShell :** `SubagentsScreen` reçoit désormais `onOpenRunTab={handleOpenRunByIds}`.

**Why:** Canonical pattern pour tous les écrans détail `.claude/` entity.
**How to apply:** Tout futur écran détail (hooks, outputStyles, mcp, permissions) doit suivre le même pattern — RuleDetailScreen / SubagentDetailScreen comme référence.
