---
name: rules-expert wired 2026-05-04
description: nakiros-rules-expert bundled skill wired into audit/fix runners + IPC handlers + frontend (mirror of claudemd-expert). Includes tsc pitfall.
type: project
---

`nakiros-rules-expert` wired on `feat/conversation-ingest` branch (2026-05-04).

**What was added:**
- Shared types: `RulesRunMode`, `RulesTargetContext` in `project.ts`; `RulesRunTarget` in `agent-run.ts`; `RuleSummary`/`RulesListResult`/`RulesReadResult`/`RulesMutationResult`/`RulesAuditHistoryEntry` in `claude-config.ts`
- 6 IPC channels: `rules:list`, `rules:read`, `rules:save`, `rules:delete`, `rules:listAudits`, `rules:readAudit`
- `services/rules-audit-history.ts`: `encodeRuleName` (replaces `/` with `__`), archive dir at `~/.nakiros/<projectId>/rules-audits/<encodedRuleName>/audit-<ISO>.md`
- `daemon/handlers/rules.ts`: `resolveRulePath` security guard (no `..`, stays under `.claude/rules/`), recursive `discoverRules` with symlink cycle detection via `visitedRealPaths: Set<string>`
- Runners: both audit and fix handle `rulesTarget` — snapshot write, first-prompt, archiving, early return in fix `finish()` (no sandbox sync-back for direct-edit runs)
- Frontend: `global.d.ts`, `nakiros-client.ts`, `run-launcher.ts` (`launchRules`), `useAgentRunsSync.ts`, `run-display.ts` (`isRules: boolean`, `targetNoun: 'rule'`)
- `AuditCompletedReport.tsx`: `hideEval = isClaudemd || isRules`
- `RunScreen.tsx`, `RunSidePanel.tsx`: `isRules` propagated, `isDirectEdit = isClaudemd || isRules`

**Why:** Mirror pattern — each `.claude/` entity (claudemd, rules, …) gets its own expert skill + runners + IPC.

**How to apply:** When wiring the next expert (subagents, hooks, etc.) follow the same pattern. Watch for `RunDock.tsx`: add explicit `if (target.type === 'X')` guard before the `switch (target.scope)` whenever a new `AgentRunTarget` variant is added — otherwise TS2339 on `.scope`/`.pluginName`.
