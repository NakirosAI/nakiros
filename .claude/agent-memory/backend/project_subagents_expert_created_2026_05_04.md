---
name: nakiros-subagents-expert bundled skill created
description: Bundled skill for auditing .claude/agents/*.md files — pure skill, no daemon wiring needed
type: project
---

`nakiros-subagents-expert` created 2026-05-04 as the 3rd `.claude/` expert (after claudemd-expert and rules-expert).

**Location**: `apps/nakiros/bundled-skills/nakiros-subagents-expert/`

**Structure** (identical to rules-expert):
- `SKILL.md` — skill entrypoint (15.2K)
- `audit-manifest.json` — 15 checks, 5 sections
- `scripts/run-static-checks.mjs` — handles 11/15 deterministic checks
- `references/` — subagents-spec.md, subagents-checklist.md, subagents-examples.md
- `assets/templates/` — subagent-template.md
- `assets/outputs/` — audit-report.md, audit-manifest.json, fix-diff.md

**Why**: No daemon wiring in this session (no `SubagentsTarget` type, no IPC channels, no runner changes).

**Static script gotchas**:
- Frontmatter parser must handle `description: >` block scalars (multi-line folded YAML) — accumulates continuation lines
- `tools:` and `disallowedTools:` both checked as arrays; inline array syntax `tools: [Read, Bash]` also supported
- `config.no_unjustified_bypass`: detects `bypassPermissions` anywhere in raw file (not just frontmatter) then scans body for justification keywords
- Both backend.md and frontend.md correctly flagged as `config.tools_scoped: fail` (they inherit all tools — intentional but warn-level)

**How to apply**: Follow same wiring pattern as rules-expert when adding SubagentsTarget to daemon (separate mission).
