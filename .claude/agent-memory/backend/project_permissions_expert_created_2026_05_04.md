---
name: nakiros-permissions-expert created
description: nakiros-permissions-expert bundled skill created 2026-05-04 (pure skill, no daemon wiring yet)
type: project
---

`nakiros-permissions-expert` bundled skill created 2026-05-04 (pure skill, no daemon wiring yet). 14 checks across 4 sections (structure/syntax/security/crossref). Singleton audit: 1 audit = entire `permissions` block of `.claude/settings.json`. Static script `--settings <path> --output-dir <path>` handles 9/14 checks (leaves 5 for agent: security.dotclaude_writes_denied, security.env_files_denied, crossref.agent_rules_match_subagents, crossref.mcp_rules_match_servers, crossref.no_useless_deny_for_undefined_tools). Key difference vs hooks-expert: sections are structure/syntax/security/crossref (not structure/handler/bp/crossref). Two critical checks: `structure.valid_json` and `security.default_mode_not_bypass`. `security.dangerous_bash_denied` is info severity (recommendation, not hard rule). No permissions block in settings.json → all checks N/A except valid_json (pass). `dontAsk` defaultMode → `security.dangerous_bash_denied` is N/A (deny-all already effective).

**Why:** 5th `.claude/` expert in the nakiros expert suite (claudemd/rules/subagents/hooks/permissions).

**How to apply:** When wiring daemon: same singleton pattern as hooks-expert. 4 IPC channels `permissions:*` (no list/delete). Pattern: archive at `~/.nakiros/<projectId>/permissions-audits/audit-<ISO>.md`.
