---
name: Edit run kind — frontend implementation
description: All frontend work required to add the 'edit' AgentRunKind: IPC client, typings, launchers, run-api, UI buttons, i18n.
type: project
---

## Files touched

- `src/lib/nakiros-client.ts` — 15 new methods (`startEdit`, `stopEdit`, `getEditRun`, `sendEditUserMessage`, `finishEdit`, `listActiveEditRuns`, `listAllEditRuns`, `getEditBufferedEvents`, `onEditEvent`, `listEditDiff`, `readEditDiffFile`, `getEditTimeline`, `getEditUsage`, `runEditEvals`)
- `src/global.d.ts` — Edit block typed with AuditRun/AuditRunEvent/SkillDiffEntry/FixTimelineEntry/FixUsage/StartEvalRunResponse
- `src/lib/run-launcher.ts` — `launchEdit(identity, openRunTab)`, plus `'edit'` branch in all 7 entity launchers (launchClaudemd, launchRules, launchSubagents, launchHooks, launchPermissions, launchMcp, launchOutputStyles); `OpenRunTabCallback.runKind` union extended
- `src/lib/run-api.ts` — `case 'edit'` dispatch
- `src/lib/run-display.ts` — `edit: 'Edit'` in ACTION_BY_KIND
- `src/components/runs/NewRunHeader.tsx` — edit icon + "Finish & deploy" condition
- `src/components/runs/RunSidePanel.tsx` — FixPanel kind extended, listDiff/subscribe routing
- `src/components/runs/AuditCompletedReport.tsx` — "Open in edit" NextStepRow (hideEval targets only); NextStepRow gained optional `subtitle` prop
- `src/views/RunScreen.tsx` — useTimeline/usageGuard/fixDiffIdentity/FixFileDiffView/titles extended; FixFileDiffView gained optional `readDiffFile` prop
- `src/components/shell/NewShell.tsx` — `handleOpenRunByIds` inline type included `'edit'`
- 8 entity screens — Edit button after Fix button

## i18n keys added

- `runs.json`: `titles.edit`, `panels.edit.{title,titleClaudemd}`, `audit.report.openInEdit.{button,subtitle}`
- 8 namespaces: `runEdit`, `runEditTitle` in `rules`, `subagents`, `claude-md`, `hooks-runner`, `permissions-runner`, `mcp-runner`, `output-styles-runner`, `skills`

## Gotcha

`NewShell.tsx:handleOpenRunByIds` has its own inline type for `runKind` — it does NOT use `OpenRunTabCallback` from run-launcher. Must update both when adding a new run kind.
