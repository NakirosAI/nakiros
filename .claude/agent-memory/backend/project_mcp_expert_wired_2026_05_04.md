---
name: nakiros-mcp-expert wired 2026-05-04
description: Wiring details for the nakiros-mcp-expert daemon integration — types, services, handlers, runners, frontend bridge
type: project
---

`nakiros-mcp-expert` wired 2026-05-04. Singleton pattern (mirrors hooks-expert). 4 IPC channels `mcp:*` (no list/delete). New types: `McpRunMode`, `McpTargetContext` (project.ts), `McpRunTarget` (agent-run.ts), `McpReadResult`/`McpExpertMutationResult`/`McpAuditHistoryEntry` (claude-config.ts).

New files:
- `services/mcp-writer.ts` — reads + writes the ENTIRE `.mcp.json` (no merge with other keys). Empty content (`{}` / empty `mcpServers`) → deletes file instead of writing.
- `services/mcp-audit-history.ts` — singleton history at `~/.nakiros/<projectId>/mcp-audits/audit-<ISO>.md` (no sub-folder per name).
- `daemon/handlers/mcp.ts` — 4 channels: `mcp:read`, `mcp:save`, `mcp:listAudits`, `mcp:readAudit`.

KEY difference vs hooks/permissions: target is the complete `.mcp.json` file at project root (not a sub-block of settings.json). `saveMcpConfig` writes the full file, not a merge.

Archive path: `~/.nakiros/<projectId>/mcp-audits/audit-<ISO>.md` (no sub-folder).

Frontend:
- `run-display.ts`: new `isMcp` boolean field in `RunDisplayContext`, `targetNoun: 'mcp'`, new branch in `runDisplayContext()`.
- `RunDock.tsx`: `if (target.type === 'mcp')` guard before `switch (target.scope)`.
- `RunSidePanel.tsx`: TWO `targetNoun` type declarations (line ~73 + inner FixPanel ~367) — both updated to include `'mcp'`.
- `AuditCompletedReport.tsx`: `hideEval = … || isMcp`.
- `global.d.ts`: `readMcp`, `saveMcp`, `listMcpAudits`, `readMcpAudit` methods.
- `nakiros-client.ts`: 4 client methods using `mcp:*` channels.
- `run-launcher.ts`: `launchMcp({ projectId, projectPath, mode })`.
- `useAgentRunsSync.ts`: `mcpTarget` branch maps to `{ type: 'mcp', ... }` AgentRunTarget.

**Why:** `nakiros-mcp-expert` bundled skill existed (pure skill) but had no daemon wiring. This session wired all 8 layers (shared types, IPC channels, services, handlers, runners, frontend bridge) in strict lockstep.

**How to apply:** Pattern is strictly identical to hooks-expert. Use hooks-expert files as reference template for any future singleton expert wiring.
