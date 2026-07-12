---
name: project-bootstrap-step2
description: Step 2 (nakiros-project-bootstrap bundled skill) of the Project .claude Bootstrap feature, done 2026-07-11
metadata:
  type: project
---

Step 2 of `docs/redesign/features/project-bootstrap.md` build order shipped 2026-07-11 on branch `feature/project-claude-bootstrap`, following [[project_bootstrap_step1_2026_07_11]].

New bundled skill at `apps/nakiros/bundled-skills/nakiros-project-bootstrap/` (SKILL.md + 3 references + 1 template, pure markdown/JSON, no code). Closest existing model was `nakiros-recommendation-analyzer` (cross-entity, writes cards not files, explicit "you never write .claude/" boundary) rather than the 7 single-entity experts — reused its structure (Inputs/Outputs tables, strict output-format reference doc, "ground every claim" safety rule, templates/ skeleton) almost directly.

**Key design decisions baked into the skill** (relevant for step 3 runner work):
- Output contract is a single `plan.json` at workdir root matching `ProjectBootstrapPlan`/`BootstrapEntityProposal` from step 1 field-for-field — no JSONL, full-object rewrite each turn (unlike audit's append-only jsonl pattern, because the plan is a small mutable whole, not a growing log).
- `target` convention per `artifactType` is fully specified in `references/plan-format.md` and mirrors the existing `*RunTarget` shapes in agent-run.ts exactly (rules/subagent/output-style → filename with `.md`; claudemd → literal `"root"`; hook/mcp → literal `"singleton"`; permission → `"project"|"local"`). This is THE contract the step-3 runner needs to dispatch execution to sister experts — read `plan-format.md` before building the runner.
- **Gotcha caught during writing**: `RecommendationArtifactType` uses singular `subagent`/`hook`/`permission` (not `subagents`/`hooks`/`permissions`) despite the target directories being pluralized (`.claude/agents/`, hooks block, permissions block). First draft of the plan-format table used the wrong plural tokens — fixed. Any future skill/runner touching `artifactType` must copy the enum token verbatim from `recommendation.ts`, never infer it from the directory name.
- Discussion-turn skill CAN itself flip a proposal's `status` between `pending`/`rejected` (conversational rejection), but must NEVER set `accepted`/`written`/`failed` — those are UI/runner-owned. This boundary is spelled out explicitly in SKILL.md's "Discussion" and gotchas sections since it's the one place the skill's write-access to `plan.json` state could accidentally overlap with runner-owned execution-outcome fields.
- "Non-minimal config" detection uses a hard binary (all-or-nothing threshold check against `dot-claude-snapshot.json`) rather than partial gap-filling — deliberately conservative per the v1 scope decision, avoids the skill silently half-merging into a rich config.
- `skill` artifactType is explicitly out of scope for v1 bootstrap proposals (would collide with `nakiros-skill-factory`'s own create flow) — documented as a gotcha, not silently omitted.

**Validation**: bundled skills have no registration step or build/lint pipeline — confirmed via `bundled-skills-reader.ts`/`bundled-skills-sync.ts` (`readdirSync` dynamic discovery, no hardcoded list, no CI workflow references "skill"). Dropping the folder in place is sufficient; `apps/nakiros/package.json`'s `files: ["dist", "bundled-skills"]` ships it as-is. No TS touched → `tsc --noEmit` on `@nakirosai/nakiros` run as a pure sanity check (0 errors), and `code-documentation`'s `compute-diff.mjs --scope apps/nakiros/bundled-skills/nakiros-project-bootstrap` returned an empty diff (markdown/JSON isn't in its scope).
