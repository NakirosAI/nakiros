# Permissions Audit Report

**Target**: `{absolute path to settings.json}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/14` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Structure | {n} | {n} | {n} |
| Rule Syntax | {n} | {n} | {n} |
| Security | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `structure.valid_json` | settings.json is valid JSON | ✅ / ❌ / N/A | {one short sentence} |
| `structure.permissions_keys_known` | Only known keys in permissions block | ✅ / ❌ / N/A | {detail} |
| `structure.rule_format` | Every rule matches expected format | ✅ / ❌ / N/A | {detail} |
| `syntax.allow_rules_valid` | Each rule in allow parses correctly | ✅ / ❌ / N/A | {detail} |
| `syntax.ask_rules_valid` | Each rule in ask parses correctly | ✅ / ❌ / N/A | {detail} |
| `syntax.deny_rules_valid` | Each rule in deny parses correctly | ✅ / ❌ / N/A | {detail} |
| `syntax.default_mode_valid` | defaultMode is a recognised permission mode | ✅ / ❌ / N/A | {detail} |
| `security.default_mode_not_bypass` | defaultMode is not bypassPermissions | ✅ / ❌ / N/A | {detail} |
| `security.dangerous_bash_denied` | At least one deny rule covers dangerous Bash | ✅ / ❌ / N/A | {detail} |
| `security.dotclaude_writes_denied` | No allow rule contradicts .claude/** write protection | ✅ / ❌ / N/A | {detail} |
| `security.env_files_denied` | Read/Edit of .env files is in deny | ✅ / ❌ / N/A | {detail} |
| `crossref.agent_rules_match_subagents` | Agent(X) rules reference existing subagents | ✅ / ❌ / N/A | {detail} |
| `crossref.mcp_rules_match_servers` | mcp__server rules reference existing MCP servers | ✅ / ❌ / N/A | {detail} |
| `crossref.no_useless_deny_for_undefined_tools` | No deny for undefined tools/agents/servers | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Permissions block is broken: invalid JSON, or defaultMode is bypassPermissions.
  Empty if no critical fail.}

### Important
- {Security/quality issues: unknown keys, invalid rule format, invalid syntax,
  allow contradicts .claude/** protection, .env files not denied, stale cross-refs.}

### Minor
- {Polish: dangerous Bash patterns not explicitly denied (recommended), useless
  deny rules for undefined tools.}

## Notes

{Optional commentary on cross-entity observations from dot-claude-snapshot.json:
 - Are all Agent(X) rules referencing real subagents?
 - Are all mcp__server rules referencing real MCP servers?
 - Any contradiction between allow rules and CLAUDE.md constraints?
 Skip if none.}
