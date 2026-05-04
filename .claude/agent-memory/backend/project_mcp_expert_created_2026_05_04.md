---
name: nakiros-mcp-expert created 2026-05-04
description: nakiros-mcp-expert bundled skill created 2026-05-04 (pure skill, no daemon wiring yet). 14 checks across 4 sections (structure/server/security/crossref). Singleton: 1 audit = entire .mcp.json file at project root.
type: project
---

`nakiros-mcp-expert` bundled skill created 2026-05-04 (pure skill, no daemon wiring yet). 14 checks across 4 sections (structure/server/security/crossref).

**Key difference vs hooks/permissions**: target is `.mcp.json` at project root (NOT inside `.claude/`), not a section of `settings.json`. The writer/reader manipulates the whole file.

Static script at `scripts/run-static-checks.mjs --mcp-config <path> --output-dir <path>` handles 10/14 deterministic checks (leaves 4 crossref for agent: referenced_in_hooks, referenced_in_subagents, referenced_in_permissions, unused_servers).

Special case: file absent → `structure.valid_json: pass` + 13 `na` (absence is valid — project simply uses no MCP servers).

`server.env_no_plain_secrets` heuristic: scan `env` and `headers` keys matching `/(token|key|secret|password)/i` — if value doesn't contain `${...}` → fail. Headers-only applies to http/sse; env-only applies to stdio (though script checks both fields regardless of transport).

`security.oauth_or_auth_documented`: deterministic check detects missing auth (no oauth, headersHelper, or Authorization header). Agent should apply judgement for localhost servers (may legitimately have no auth).

**Why:** `env` is only available for stdio transport in the spec, but `headers` is only for http/sse. Script checks both for defense-in-depth (catches misplaced fields).
