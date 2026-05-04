# MCP Audit Report

**Target**: `{absolute path to .mcp.json}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/14` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Structure | {n} | {n} | {n} |
| Server Config | {n} | {n} | {n} |
| Security | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `structure.valid_json` | .mcp.json is valid parseable JSON | ✅ / ❌ / N/A | {one short sentence} |
| `structure.mcp_servers_object` | mcpServers key present and is an object | ✅ / ❌ / N/A | {detail} |
| `structure.no_unknown_server_keys` | Each server only has recognised keys | ✅ / ❌ / N/A | {detail} |
| `server.type_valid` | Each server has type ∈ {http, sse, stdio} | ✅ / ❌ / N/A | {detail} |
| `server.required_fields` | url for http/sse, command for stdio — present and non-empty | ✅ / ❌ / N/A | {detail} |
| `server.no_deprecated_sse` | No SSE transport (deprecated — migrate to HTTP) | ✅ / ❌ / N/A | {detail} |
| `server.env_no_plain_secrets` | Secrets use ${VAR} interpolation, not plain text | ✅ / ❌ / N/A | {detail} |
| `security.https_for_remote_servers` | http/sse server URLs start with https:// | ✅ / ❌ / N/A | {detail} |
| `security.no_alwaysLoad_overuse` | At most 1-2 servers with alwaysLoad: true | ✅ / ❌ / N/A | {detail} |
| `security.oauth_or_auth_documented` | http/sse servers have auth configured | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_in_hooks` | mcp_tool hooks reference real servers | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_in_subagents` | mcpServers in subagent frontmatter exist | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_in_permissions` | mcp__server__* permission rules reference real servers | ✅ / ❌ / N/A | {detail} |
| `crossref.unused_servers` | No servers configured but never referenced | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {MCP config is broken: invalid JSON, or http/sse servers using http:// URLs.
  Empty if no critical fail.}

### Important
- {Security or quality issues: mcpServers key missing/invalid, unknown server keys,
  invalid type, missing required fields, plain-text secrets, no auth on remote servers,
  stale cross-refs.}

### Minor
- {Polish: SSE deprecated (migrate to http), alwaysLoad overuse, unused servers.}

## Notes

{Optional commentary on cross-entity observations from dot-claude-snapshot.json:
 - Are all hook-referenced MCP servers present in mcpServers?
 - Do any subagents reference servers not in this file?
 - Are permission rules consistent with the server list?
 - Are there unused servers that could be cleaned up?
 Skip if none.}
