---
name: nakiros-output-styles-expert created 2026-05-04
description: Pure bundled skill (no daemon wiring yet) for .claude/output-styles/<name>.md files. 12 checks across 4 sections, 8 deterministic.
type: project
---

`nakiros-output-styles-expert` bundled skill created 2026-05-04 (pure skill, no daemon wiring yet). 12 checks across 4 sections (frontmatter/structure/content/crossref). Static script `scripts/run-static-checks.mjs --style <path> --output-dir <path>` handles 8/12 deterministic checks (leaves 4 for agent: content.tone_specified, content.format_specified, crossref.no_conflict_with_claudemd, crossref.unique_role). Key difference vs rules: no `paths:` field in frontmatter (output styles are not path-scoped). `keep-coding-instructions` boolean field (default false) — when false, style REPLACES system prompt; when true, appended. `frontmatter.name_or_filename` is info (filename fallback is valid). `structure.body_present` critical (>= 5 meaningful lines). `content.role_defined` heuristic: regex `/(you are|tu es|act as|behave as|as a |as an )/i` in body prose. `content.imperative_mood` threshold: <= 2 hedges = pass, >= 3 = fail. V1 audits project-scope only (`.claude/output-styles/`), not user (~/.claude) or plugin scope. This is the 7th and final `.claude/` expert.

**Why:** Completes the 7-expert `.claude/` suite for Nakiros. Output styles are "always active" once selected — vague or hedged styles produce persistent behavioral inconsistency.

**How to apply:** When wiring daemon (future session), pattern mirrors rules-expert/subagents-expert (collection pattern, 6 IPC channels `output-styles:*`). Archive path would be `~/.nakiros/<projectId>/output-styles-audits/<encodedStyleName>/audit-<ISO>.md`.
