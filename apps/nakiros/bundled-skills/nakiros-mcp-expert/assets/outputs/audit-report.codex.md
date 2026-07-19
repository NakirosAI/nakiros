# MCP Audit Report (Codex)

**Provider**: `codex`
**Target**: `{absolute path to .codex/config.toml}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/14` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

> **V1 ceiling**: 6 of the 14 checks are structurally N/A for Codex today —
> `security.no_alwaysLoad_overuse`, `security.oauth_or_auth_documented`, and
> all 4 `crossref.*` checks (no `dot-codex-snapshot.json` yet). A high score
> reflects what V1 can verify, not full parity with the Claude audit. See
> Notes.

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
| `structure.valid_toml` | .codex/config.toml is valid TOML, no unrelated root key | ✅ / ❌ / N/A | {one short sentence} |
| `structure.mcp_servers_table` | mcp_servers key present and is a table | ✅ / ❌ / N/A | {detail} |
| `structure.no_unknown_server_keys` | Each server only has recognised keys | ✅ / ❌ / N/A | {detail} |
| `server.transport_resolvable` | Server declares exactly one of url/command | ✅ / ❌ / N/A | {detail} |
| `server.required_fields` | url for inferred http, command for inferred stdio | ✅ / ❌ / N/A | {detail} |
| `server.no_sse` | No server requests the unrepresentable sse transport | ✅ / ❌ / N/A | {detail} |
| `server.env_no_plain_secrets` | No literal-looking secrets in env/http_headers | ✅ / ❌ / N/A | {detail} |
| `security.https_for_remote_servers` | Servers with a url use https:// | ✅ / ❌ / N/A | {detail} |
| `security.no_alwaysLoad_overuse` | N/A — no Codex equivalent | N/A | alwaysLoad has no Codex equivalent |
| `security.oauth_or_auth_documented` | N/A — no Codex equivalent | N/A | oauth/headersHelper have no Codex equivalent |
| `crossref.referenced_in_hooks` | N/A — no dot-codex-snapshot.json yet | N/A | Known V1 limitation |
| `crossref.referenced_in_subagents` | N/A — no dot-codex-snapshot.json yet | N/A | Known V1 limitation |
| `crossref.referenced_in_permissions` | N/A — no dot-codex-snapshot.json yet | N/A | Known V1 limitation |
| `crossref.unused_servers` | N/A — no dot-codex-snapshot.json yet | N/A | Known V1 limitation |

## Priority fixes

### Critical
- {MCP config is broken: invalid TOML, unrelated root key, or a url-bearing
  server using http://. Empty if no critical fail.}

### Important
- {Quality issues: mcp_servers table missing/invalid, unknown server keys
  (including leftover Claude-only keys), ambiguous transport, missing
  required fields, literal-looking secrets.}

### Minor
- {Polish: sse requested (unsupported — remove the key), anything else
  info-level.}

## Notes

{Optional commentary:
 - Was a `type`, `oauth`, `headersHelper`, `alwaysLoad`, or `headers` key
   found anywhere — likely copy-pasted from a Claude `.mcp.json`?
 - Remind the user that cross-entity and auth/alwaysLoad checks are N/A by
   design in V1, not verified-clean.
 Skip if none.}
