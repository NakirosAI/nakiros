---
name: McpScreen — singleton expert .mcp.json
description: McpScreen miroir HooksScreen ; toggle Form/JSON ; McpFormEditor dans views/mcp/ ; namespace i18n mcp-runner ; IPC mcp:read/save/listAudits/readAudit ; carte MCP dans ProjectOverview ; sidebar warnings spécifiques
type: project
---

McpScreen singleton (`views/McpScreen.tsx`) remplace le legacy (`views/mcp/McpScreen.tsx` orchestrateur).

- Legacy conservé : `views/mcp/McpEditor.tsx`, `McpList.tsx`, `useMcp.ts` — non touchés (toujours importables pour d'autres usages)
- Nouveaux fichiers :
  - `views/mcp/useMcpFile.ts` — hook calqué sur `useHooksFile.ts`, IPC `mcp:read/save`
  - `views/mcp/McpFormEditor.tsx` — form editor extrait du legacy McpEditor, parse `{ mcpServers: { [name]: {...} } }`, API `{ value, onChange }`
  - `views/McpScreen.tsx` — singleton 3-onglets (Edit/Audit/Fix), calqué sur HooksScreen ligne par ligne
  - `i18n/locales/{en,fr}/mcp-runner.json` — namespace `mcp-runner` (distinct de `mcp` Module 5)

Pattern sidebar Edit tab MCP :
- Count de servers
- Distribution par type (stdio/http/sse)
- Liste des servers avec transport
- Warnings : httpNotHttps (critical), plainSecrets (critical), sseDeprecated (warn), alwaysLoadOveruse (warn)

`ProjectOverviewScreen` : carte MCP avec icône `Plug` (même icône que NewShellSidebar), clé i18n `config.mcp`.

`NewShell.tsx` : McpScreen reçoit désormais `onOpenRunTab={handleOpenRunByIds}`.

`i18n/index.ts` : namespace `mcp-runner` enregistré en FR et EN.

**Why:** .mcp.json est un fichier complet (pas un sous-bloc settings.json), donc `readMcp`/`saveMcp` opèrent sur le fichier entier. `mtime` toujours une string vide si fichier inexistant.
