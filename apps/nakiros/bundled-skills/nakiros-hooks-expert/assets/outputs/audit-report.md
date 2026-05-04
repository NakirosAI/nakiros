# Hooks Audit Report

**Target**: `{absolute path to settings.json}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/14` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Structure | {n} | {n} | {n} |
| Handler | {n} | {n} | {n} |
| Best Practices | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `structure.valid_json` | settings.json is valid JSON | ✅ / ❌ / N/A | {one short sentence} |
| `structure.valid_event_name` | Every hooks key is a known hook event | ✅ / ❌ / N/A | {detail} |
| `structure.matcher_compatible_with_event` | No matcher set on events that ignore it | ✅ / ❌ / N/A | {detail} |
| `structure.handlers_array_non_empty` | Each matcher group has at least 1 handler | ✅ / ❌ / N/A | {detail} |
| `handler.type_valid` | Each handler type is valid | ✅ / ❌ / N/A | {detail} |
| `handler.required_fields` | Required fields present per handler type | ✅ / ❌ / N/A | {detail} |
| `handler.timeout_explicit` | timeout set on command handlers | ✅ / ❌ / N/A | {detail} |
| `handler.if_condition_valid` | if field only on tool events and has valid syntax | ✅ / ❌ / N/A | {detail} |
| `bp.exit_code_2_for_blocking` | Blocking command hooks use exit 2 | ✅ / ❌ / N/A | {detail} |
| `bp.no_unjustified_dangerous` | No HTTP URLs, no path traversal | ✅ / ❌ / N/A | {detail} |
| `bp.idempotent_or_documented` | Command hooks are idempotent or documented | ✅ / ❌ / N/A | {detail} |
| `crossref.command_path_exists` | Script paths referenced via $CLAUDE_PROJECT_DIR exist | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_subagent_exists` | SubagentStart/Stop matchers reference real subagents | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_mcp_server_exists` | mcp_tool hooks reference real MCP servers | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Hooks block is broken: invalid JSON, unknown event names, invalid handler types,
  missing required fields. Empty if no critical fail.}

### Important
- {Quality issues: matcher on ignored event, empty handler arrays, timeout missing,
  invalid if field, HTTP URLs, path traversal, stale cross-refs.}

### Minor
- {Polish: no exit 2 on blocking hooks, side-effects undocumented.}

## Notes

{Optional commentary on cross-entity observations from dot-claude-snapshot.json:
 - Are all script paths resolved correctly against $CLAUDE_PROJECT_DIR?
 - Do SubagentStart/Stop matchers reference real subagents?
 - Do mcp_tool handlers reference real MCP servers?
 - Any contradiction between hooks policy and CLAUDE.md constraints?
 Skip if none.}
