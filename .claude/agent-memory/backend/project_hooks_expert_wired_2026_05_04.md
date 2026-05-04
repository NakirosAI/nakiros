---
name: hooks expert wired 2026-05-04
description: nakiros-hooks-expert wired into daemon — types, runners, handlers, frontend bridge
type: project
---

`nakiros-hooks-expert` wired 2026-05-04. Pattern: **singleton** (mirrors claudemd, NOT rules/subagents — no name field, no sub-folder per target).

New types in `packages/shared/src/types/`:
- `project.ts`: `HooksRunMode`, `HooksTargetContext`
- `agent-run.ts`: `HooksRunTarget` (type: 'hooks', no ruleName/subagentName), extends `AgentRunTarget`
- `claude-config.ts`: `HooksReadResult`, `HooksExpertMutationResult`, `HooksAuditHistoryEntry`

IPC channels added (4, not 6 — no list/delete since singleton):
- `hooks:read`, `hooks:save`, `hooks:listAudits`, `hooks:readAudit`

**DO NOT confuse with** `claudeHooks:read`/`claudeHooks:save` (Module 6 V2 structured editor). These `hooks:*` channels are for the expert skill flow only.

New files:
- `services/hooks-writer.ts`: `readHooksBlock(projectPath)`, `saveHooksBlock(projectPath, hooksJsonString, mtimeAtRead)`. Key: reads ONLY the `hooks` key, merges back into full settings.json preserving all other keys. Empty object → removes `hooks` key entirely.
- `services/hooks-audit-history.ts`: singleton archive at `~/.nakiros/<projectId>/hooks-audits/audit-<ISO>.md`. Exports `hooksAuditArchiveDir(projectId)`, `listHooksAudits(projectId)`, `readHooksAudit(absolutePath)`.
- `daemon/handlers/hooks.ts`: 4 channels registered as `hooksHandlers`.

Runners (audit + fix):
- Constant: `HOOKS_EXPERT_SKILL_NAME = 'nakiros-hooks-expert'`
- `prepareWorkdir`: symlinks expert + writes dot-claude-snapshot.json (same as others)
- `buildFirstPrompt`: references `settingsPath = join(projectPath, '.claude', 'settings.json')`
- `createInitialRun`: includes `hooksTarget`
- `findActiveForTarget`: singleton match — only `hooksTarget.projectId`
- `rehydrate`: restores `hooksTarget`
- `archiveReport` (audit-runner): archives to `hooksAuditArchiveDir(ht.projectId)/audit-<ISO>.md`
- `finish` (fix-runner): `if (run.hooksTarget)` — direct edit, no sync-back

Frontend:
- `global.d.ts`: `readHooks`, `saveHooks`, `listHooksAudits`, `readHooksAudit`
- `nakiros-client.ts`: implementations via `hooks:*` channels
- `run-launcher.ts`: `launchHooks({ projectId, projectPath, mode })` — no `name` param
- `useAgentRunsSync.ts`: `if (run.hooksTarget)` branch, target type `'hooks'`
- `run-display.ts`: `isHooks` field added to `RunDisplayContext`; `targetNoun` extended to include `'hooks'`
- `AuditCompletedReport.tsx`: `hideEval = isClaudemd || isRules || isSubagents || isHooks`
- `RunDock.tsx`: `if (target.type === 'hooks')` guard before `switch (target.scope)`
- `RunSidePanel.tsx`: BOTH targetNoun type declarations include `'hooks'` (line ~73 props + line ~367 inner FixPanel)
