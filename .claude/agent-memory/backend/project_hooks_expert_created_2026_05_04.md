---
name: project_hooks_expert_created_2026_05_04
description: nakiros-hooks-expert bundled skill created 2026-05-04 — pure skill, no daemon wiring. 14 checks, singleton audit on settings.json hooks block.
type: project
---

`nakiros-hooks-expert` created 2026-05-04 (pure skill, no daemon wiring).

**Why:** 4th `.claude/` expert in the nakiros series (after claudemd/rules/subagents).

**How to apply:** When wiring hooks:expert to daemon (audit/fix runners + IPC channels), follow the same pattern as rules-expert and subagents-expert. Archive path will be `~/.nakiros/<projectId>/hooks-audits/audit-<ISO>.md` (singleton — no per-hook granularity).

Key structural differences vs other experts:
- Hooks live in **JSON** (`.claude/settings.json`), not markdown — no frontmatter parser in static script
- Audit is **singleton**: 1 audit = full `hooks` block (not per-event or per-hook)
- 14 checks across 4 sections: structure/handler/bp/crossref
- Static script handles 9/14 checks (leaves 5 for agent judgment)
- `bp.no_unjustified_dangerous` is partially deterministic (HTTP URL + `../` path traversal) — included in static script
- `Stop` event silently ignores `matcher` — checked by `structure.matcher_compatible_with_event`

Files created:
- `apps/nakiros/bundled-skills/nakiros-hooks-expert/SKILL.md` (15K)
- `apps/nakiros/bundled-skills/nakiros-hooks-expert/audit-manifest.json` (14 checks)
- `apps/nakiros/bundled-skills/nakiros-hooks-expert/scripts/run-static-checks.mjs` (~15K)
- `references/hooks-spec.md`, `hooks-checklist.md`, `hooks-examples.md`
- `assets/templates/hooks-template.json`
- `assets/outputs/audit-report.md`, `audit-manifest.json`, `fix-diff.md`

Test results on project `.claude/settings.json`:
- 9 checks emitted, all pass (PostToolUse + Stop events, 3 command handlers)
- Edge cases: missing file → 1 fail + 13 na; invalid JSON → 1 fail + 13 na; unknown event + matcher on Stop → correct fails
