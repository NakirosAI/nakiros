---
name: nakiros-subagents-expert wired 2026-05-04
description: Full daemon + frontend wiring of nakiros-subagents-expert into audit/fix runners, IPC handlers, and frontend bridge. Symmetry with nakiros-rules-expert.
type: project
---

`nakiros-subagents-expert` wired 2026-05-04 by exact symmetry with `nakiros-rules-expert`.

**New shared types** (`packages/shared/src/types/`):
- `project.ts`: `SubagentsRunMode` = `'audit' | 'fix'`, `SubagentsTargetContext` interface, `subagentsTarget?` on `AuditRun` and `StartAuditRequest`
- `agent-run.ts`: `SubagentsRunTarget` interface, added to `AgentRunTarget` union
- `claude-config.ts`: `SubagentSummary`, `SubagentsListResult`, `SubagentsReadResult`, `SubagentsMutationResult`, `SubagentsAuditHistoryEntry`

**New IPC channels** (`packages/shared/src/ipc-channels.ts`): `subagents:list`, `subagents:read`, `subagents:save`, `subagents:delete`, `subagents:listAudits`, `subagents:readAudit`

**New daemon files**:
- `apps/nakiros/src/services/subagents-audit-history.ts` — calque of `rules-audit-history.ts`. Archive path: `~/.nakiros/<projectId>/subagents-audits/<encodedSubagentName>/audit-<ISO>.md`
- `apps/nakiros/src/daemon/handlers/subagents.ts` — 6 handlers, recursive `discoverSubagents()` with symlink cycle detection (visited realPaths set), `resolveSubagentPath()` with path-traversal guard

**Runner wiring** (`audit-runner.ts`, `fix-runner.ts`):
- Both handle `subagentsTarget` in `prepareWorkdir` (snapshot write), `buildFirstPrompt`, `createInitialRun`, `findActiveForTarget`, `rehydrate`
- `audit-runner.ts`: handles `archiveReport` for subagentsTarget
- `fix-runner.ts`: skips sandbox sync-back (same as claudemdTarget/rulesTarget)

**Frontend bridge** (7 files):
- `global.d.ts`: 4 imports + 6 new methods
- `nakiros-client.ts`: 6 `subagents:*` implementations
- `run-launcher.ts`: `launchSubagents()` function
- `useAgentRunsSync.ts`: `subagentsTarget` branch in `auditLikeToAgentRun()`
- `run-display.ts`: `isSubagents` field on `RunDisplayContext`, `'subagent'` on targetNoun, full subagentsTarget branch
- `AuditCompletedReport.tsx`: `isSubagents` in destructuring, extended `hideEval` condition
- `RunDock.tsx`: `if (target.type === 'subagents')` guard before switch

**Critical gotcha**: `RunSidePanel.tsx` has TWO separate `targetNoun` type annotations (one in the top-level props interface ~line 73, one in the inner `FixPanel` props ~line 367). Both must include `| 'subagent'` — missing either one causes TS2322 error in `RunScreen.tsx`.

**Why:** Mirrors the exact same pattern used for `nakiros-rules-expert` wiring.
**How to apply:** Use this as the reference for wiring the next `.claude/` expert (hooks, permissions, mcp, output-styles).
