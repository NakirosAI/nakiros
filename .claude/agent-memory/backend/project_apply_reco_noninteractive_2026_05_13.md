---
name: project_apply_reco_noninteractive_2026_05_13
description: apply-recommendation non-interactive mode via first-prompt embedding (shipped 2026-05-13)
metadata:
  type: project
---

`<apply-recommendation>` non-interactive mode shipped 2026-05-13 via first-prompt embedding.

**What changed:**
- `ApplyRecommendationContext` interface added to `packages/shared/src/types/project.ts` (imports `RecommendationArtifactType` from `recommendation.ts`). Optional `applyRecommendation` field on `StartAuditRequest`.
- `buildNonInteractiveApplyPrompt(req, workdir, languageLine)` added to `fix-runner.ts` just before the `spec` object. Uses `resolveApplyTarget()` lookup table (8 artefact types → skillName/slashCmd/writePath/writeMode/label). Single template, no 8× duplication.
- Early-return at top of `buildFirstPrompt`: `if (req.applyRecommendation) return buildNonInteractiveApplyPrompt(...)`.
- `ReqBuilder` signature extended with `brief: string` 4th arg. All 8 `EDIT_REQ_BUILDERS` + skill path set `applyRecommendation: buildApplyCtx(card, brief)`.
- `mappingFor()` `RunMapping` interface dropped `sender` field.
- `applyReco()` no longer calls `mapping.sender(...)` — the `<apply-recommendation>` block is now in the first prompt, not in a second user message.

**Why:** Interactive first prompt asked "que veux-tu modifier ?" before the `<apply-recommendation>` block arrived as 2nd message — expert skill never saw it on turn 1.

**Edge cases handled:**
- `claudemd`/`mcp`: `writeMode: 'direct'` (no `.claude/**` constraint — target is CLAUDE.md or .mcp.json at project root).
- `hooks`/`permissions`: `writeMode: 'draft-json'` → draft.json.
- `rules`/`subagents`/`output-styles`: `writeMode: 'draft-md'` → draft.md.
- Skill path (no `*Target`): sets `applyRecommendation` on the plain `{ scope: 'project', skillName, projectId }` request.

**Bug fixed 2026-05-13 (round 3): symlink not created → draft.md never written → sync-back silently fails**

Root cause: handler `recommendations:applyReco` called `applyReco` without `skillDir`. `applyReco` passed `opts.skillDir = ctx.skillDir ?? ''` (empty string) to `startEdit`. `prepareWorkdir` called `realpathSync('')` → exception → symlink `<workdir>/.claude/skills/<expertName>` never created → expert slash-command failed to resolve → agent never ran (or ran without context) → `draft.md` absent from workdir → `finish` emitted `failed` with "draft.md absent" error (or silently nothing if error was swallowed).

Fix: added `resolveSkillDirFromReq(req, projectPath)` helper in `recommendation-apply.ts` that mirrors `skill-dir.ts:resolveSkillDir` for `nakiros-bundled` (→ `~/.nakiros/skills/<name>`) and `project` (→ `<projectPath>/.claude/skills/<name>`) scopes. Used as fallback: `const skillDir = ctx.skillDir || resolveSkillDirFromReq(req, ctx.projectPath)`. No import from `daemon/handlers/` — logic is 2 lines.
