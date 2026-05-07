---
name: project_edit_mode_wired_2026_05_07
description: `edit` run kind wired 2026-05-07 — third mode in fix-runner, new handlers/edit.ts, 8 SKILL.md sections
type: project
---

`edit` mode shipped 2026-05-07. `SkillAgentMode` extended to `'fix' | 'create' | 'edit'`.

**Why:** User-driven interactive editing without audit findings driving the flow.

**How to apply:** `edit` reuses 100% of the fix-runner runtime. Differences: workdir seeding includes copy (same as fix, no empty workdir like create), buildFirstPrompt has per-entity `mode === 'edit'` branches injected BEFORE the fix/create dispatch.

Key patterns:
- `prepareWorkdir`: `'fix' || 'edit'` seeds workdir identically (copySkillSourceForFix + latestAudit + latestIteration).
- `buildFirstPrompt`: each entity block checks `req.mode === 'edit'` first and returns early with an edit-specific prompt. The fix/create dispatch follows.
- `rehydrate`: `'edit'` behaves like `'fix'` (canResume logic) — no extra handling needed.
- `finish`/`findActiveForTarget`: all unchanged — `mode` comparison still works correctly since edit entries carry mode='edit'.
- Public exports added: `startEdit`, `finishEdit`, `stopEdit`, `sendEditUserMessage`, `getEditRun`, `getEditTempWorkdir`, `getEditRealSkillDir`, `getEditBufferedEvents`, `registerEditEvalBatch`, `listEditEditsHistory`, `getEditTimeline`, `getEditUsage`, `listEditDiff`, `readEditDiffFile`, `listActiveEditRuns`, `listAllEditRuns`.

**IPC channels**: 14 channels `edit:*` (shared layer done before this session). Key: `edit:getBenchmarks`, `edit:getEditsHistory`, `edit:getEditTempMatrix` were NOT added to IPC_CHANNELS — these are intentionally absent from the 14-channel spec. Frontend can call `fix:getBenchmarks` etc. with an editRunId (same registry).

**New file**: `apps/nakiros/src/daemon/handlers/edit.ts` — mirrors fix.ts. Registered in `handlers/index.ts`.

**SKILL.md sections**: "Edit mode" section added to all 8 bundled skills (nakiros-skill-factory + 7 experts). Each section mentions the correct draft path (./draft.md for markdown entities, ./draft.json for hooks/permissions, direct file for claudemd/mcp).
