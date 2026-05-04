---
name: ClaudeMdScope removed 2026-05-04
description: Multi-scope CLAUDE.md support removed — only root CLAUDE.md remains
type: project
---

`ClaudeMdScope` ('root'|'claude-dir'|'local') has been fully removed from the product on 2026-05-04 (branch `feat/conversation-ingest`).

**Why:** User decision — the multi-scope variants (`.claude/CLAUDE.md`, `CLAUDE.local.md`) provide no clear value; simplifying to root-only reduces complexity across the entire stack.

**How to apply:**
- `ClaudeMdSummary` no longer has a `scope` field.
- `ClaudeMdListResult.files[]` → `ClaudeMdListResult.file` (singular).
- `SaveClaudeMdRequest` no longer has `scope`.
- `ClaudeMdRunTarget` / `ClaudeMdTargetContext` no longer have `scope` or `targetPath` — only `{ projectId, projectPath, mode }`.
- `ClaudeMdAuditHistoryEntry` no longer has `scope`.
- Archive filename: `audit-<ISO>.md` (was `audit-<scope>-<ISO>.md`).
- Handlers `claudeMd:read`, `claudeMd:delete`, `claudeMd:listAudits` no longer accept a scope argument.
- `launchClaudemd()` in run-launcher no longer accepts `scope` or `targetPath`.
