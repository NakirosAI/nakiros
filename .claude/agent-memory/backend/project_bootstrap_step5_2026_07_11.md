---
name: project-bootstrap-step5
description: Step 5 (final — wire plan-approval to per-entity writers) of the Project .claude Bootstrap feature, done 2026-07-11
metadata:
  type: project
---

Step 5 (final step) shipped 2026-07-11 on branch `feature/project-claude-bootstrap`, following [[project_bootstrap_step3_2026_07_11]]. Replaced the `dispatchApprovedProposals` no-op stub in `apps/nakiros/src/services/bootstrap-runner.ts` with real dispatch to the existing per-entity writers.

**Key discovery that changed the plan**: there are TWO parallel writer families per `.claude/` entity in this codebase, not one:
1. The `claude-*-writer.ts` family (`claude-rules-writer.ts`, `claude-agents-writer.ts`, etc.) backs the Module 1-7 V2 form editors and takes **DECOMPOSED** fields (e.g. `SaveRuleRequest.{paths: string[], body: string}` with frontmatter stripped, `SaveHooksRequest.events: HookEditEvent[]` structured rows, `SavePermissionsRequest.{allow, deny, ask, defaultMode}` arrays) — wrong shape for bootstrap, which only has one full raw string per proposal.
2. A second, RAW-CONTENT family: `hooks-writer.ts`/`permissions-writer.ts`/`mcp-writer.ts` (no `claude-` prefix) take a raw JSON string of just their block and MERGE it into `settings(.local).json`/`.mcp.json` themselves — these already existed and were exactly the right fit, used directly. But for rules/subagents/output-styles, the equivalent raw-content logic was NOT extracted into a service — it lived **inline inside the IPC handler's `*:save` closure** (`daemon/handlers/{rules,subagents,output-styles}.ts`), including a module-private `resolve*Path` traversal guard. Had to extract it first.

**New service files created** (raw-content writers, extracted from the handlers, zero behavior change — same code, one more caller):
- `apps/nakiros/src/services/rules-writer.ts` — `resolveRulePath`, `writeRuleFile`
- `apps/nakiros/src/services/subagents-writer.ts` — `resolveSubagentPath`, `writeSubagentFile`
- `apps/nakiros/src/services/output-styles-writer.ts` — `resolveStylePath`, `writeOutputStyleFile`

`daemon/handlers/{rules,subagents,output-styles}.ts`'s `*:save` handlers now just call these (removed ~30 lines of duplicated inline logic + the now-unused `mkdirSync`/`writeFileSync`/`dirname` imports from each). If a 4th entity ever needs this treatment, this is the pattern: extract `resolve*Path` + the save closure body into `services/<entity>-writer.ts`, keep list/read/delete inline in the handler (those aren't needed by bootstrap).

**New dispatch file**: `apps/nakiros/src/services/bootstrap-dispatch.ts` — `dispatchProposal(projectPath, proposal)` (per-proposal, never throws, routes on `artifactType`) + `dispatchBootstrapPlan(projectPath, proposals)` (maps over all proposals, only touches `status === 'accepted'` ones, returns `{proposals, summary}`). Extracted to its own file rather than growing `bootstrap-runner.ts` further (was already 671 lines after step 3).

**artifactType → writer mapping** (final, verified via dry-run — see below):
- `claudemd` → `claude-md-writer.saveClaudeMd` (already raw-content, no change needed)
- `rules` → `rules-writer.writeRuleFile` (NEW service)
- `subagent` → `subagents-writer.writeSubagentFile` (NEW service)
- `output-style` → `output-styles-writer.writeOutputStyleFile` (NEW service)
- `hook` → `hooks-writer.saveHooksBlock` (existing, unchanged)
- `permission` → `permissions-writer.savePermissionsBlock` (existing, unchanged; `target` cast to `'project'|'local'`)
- `mcp` → `mcp-writer.saveMcpConfig` (existing, unchanged)
- `skill` → always `failed`, explicit "not supported in v1" message (never silently dropped)

**Failure semantics**: `mtimeAtRead: ''` (blind write) on every writer call — bootstrap proposals never have a prior read to compare against. For `rules`/`subagent`/`output-style` (genuinely NEW entities under the feature's "minimal config" precondition), an `existsSync` collision check runs BEFORE calling the writer and fails the proposal rather than silently overwriting — added defense-in-depth since the writer itself would otherwise blindly clobber. `claudemd`/`hook`/`permission`/`mcp` allow blind overwrite/merge (matches how those writers already behave for the V2 editors — a stub CLAUDE.md or an empty hooks/permissions/mcp block is a legitimate write target). `dispatchProposal` wraps everything in try/catch even though the writers already return result objects (never throw) — pure defense in depth. One failing proposal never aborts the batch (`.map`, not early-return).

**Run lifecycle**: `approveBootstrapPlan` → `run.status = 'executing'` → `dispatchApprovedProposals` (in bootstrap-runner.ts) calls `dispatchBootstrapPlan(run.projectPath, ...)` — note **`run.projectPath`, never `run.cwd`** (the worktree) — then `run.status = 'completed'` unconditionally (even with partial failures; per-proposal status/error carries detail, final `done` event's `error` field gets a one-line summary when `failed > 0`). Only exception: if `dispatchBootstrapPlan` itself throws (not expected — `dispatchProposal`'s internal try/catch should prevent this — but guarded anyway) → `run.status = 'failed'`.

**Verified beyond tsc**: wrote a throwaway `tsx` dry-harness (scratchpad only, not committed) exercising `dispatchBootstrapPlan` against a real temp directory with 8 accepted proposals (one per artifactType) + 1 pre-existing colliding rule + 1 rejected proposal. Confirmed: all 7 non-skill/non-colliding proposals actually written to disk with correct content; `skill` proposal failed with the expected message; colliding rule proposal failed with "already exists" and did NOT touch the original file content; rejected proposal never touched disk; **hooks + permissions correctly merged into the SAME `settings.json`** (sequential writes to the same file preserved both keys — confirms `saveHooksBlock`/`savePermissionsBlock`'s own read-current-file-then-merge behavior composes correctly when called back-to-back in one dispatch batch, which was the biggest correctness risk in this design). Summary counts (`total:9, written:7, failed:2`) matched exactly.

**Validation**: no shared-type changes this round (all needed fields already existed from step 1). `tsc --noEmit` clean on `@nakiros/shared`, `@nakirosai/nakiros`, `@nakiros/frontend`. `pnpm -F @nakirosai/nakiros build` (tsup) clean.
