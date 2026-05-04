---
name: output-styles expert wired 2026-05-04
description: nakiros-output-styles-expert daemon wiring — collection pattern, name collision gotcha
type: project
---

`nakiros-output-styles-expert` wired on `feat/conversation-ingest` 2026-05-04.

Collection pattern (mirrors rules/subagents), NOT singleton.

**Critical gotcha — name collision in claude-config.ts:**
Module 3 V2 output-styles editor already defines `OutputStylesListResult` (with `items: OutputStyleEntry[]`).
The expert list result MUST be named `OutputStylesExpertListResult` (with `styles: OutputStyleSummary[]`).
Same pattern as `McpExpertMutationResult` vs `McpMutationResult`. Check for existing types before naming.

**Why:** Two `export interface OutputStylesListResult` → immediate tsc error (duplicate identifier).

**How to apply:** When adding expert types for a domain that already has V2 editor types in claude-config.ts,
grep the full file first and use `Expert` suffix to disambiguate. Applies to any future expert that targets
a `.claude/` entity already covered by a V2 editor module.

New files:
- `apps/nakiros/src/services/output-styles-audit-history.ts`
- `apps/nakiros/src/daemon/handlers/output-styles.ts`

New shared types (all in claude-config.ts):
- `OutputStyleSummary` — has `displayName` (from frontmatter `name:`) unique vs rules/subagents
- `OutputStylesExpertListResult` — note `Expert` in name to avoid collision
- `OutputStylesReadResult`
- `OutputStylesExpertMutationResult`
- `OutputStylesAuditHistoryEntry` — uses `sizeBytes` (not `score`) like hooks/mcp/permissions

6 IPC channels `outputStyles:*` (list/read/save/delete/listAudits/readAudit).

Archive path: `~/.nakiros/<projectId>/output-styles-audits/<encodedStyleName>/audit-<ISO>.md`
`encodeStyleName`: strips leading/trailing `/`, replaces inner `/` with `__`.

Frontend wiring:
- `RunDock.tsx` guard: `if (target.type === 'output-styles')` before `switch (target.scope)`
- `run-display.ts`: `isOutputStyles` flag, `targetNoun: 'output style'`
- `RunSidePanel.tsx`: TWO `targetNoun` type declarations — both need `'output style'`
- `AuditCompletedReport.tsx`: `hideEval` extended with `|| isOutputStyles`
