# MCP Fix Diff (Codex)

**Provider**: `codex`
**Target**: `{absolute path to .codex/config.toml}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/14`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Remove leftover sse/type key from legacy-api"}
- **Source**: `{audit:server.no_sse}`
- **Server path**: `mcp_servers.legacy-api`
- **Diff**:
```diff
  [mcp_servers.legacy-api]
- type = "sse"
  url = "https://api.legacy.corp/mcp"
```

### 2. {next edit — e.g. "Move Authorization value off a hardcoded literal"}
- **Source**: `{audit:server.env_no_plain_secrets}`
- **Server path**: `mcp_servers.my-api.http_headers`
- **Diff**:
```diff
  [mcp_servers.my-api.http_headers]
- Authorization = "Bearer sk-prod-a1b2c3d4"
+ Authorization = "Bearer <replace-with-your-own-secret-injection>"
```

### 3. {e.g. "Fix non-HTTPS URL on data-warehouse"}
- **Source**: `{audit:security.https_for_remote_servers}`
- **Server path**: `mcp_servers.data-warehouse`
- **Diff**:
```diff
  [mcp_servers.data-warehouse]
- url = "http://dw.internal.corp/mcp"
+ url = "https://dw.internal.corp/mcp"
```

## Edits skipped

- `{finding type}` — reason: `{e.g. "ambiguous intent — leaving both url and command until the user confirms which transport they meant"}`

## Resulting .codex/config.toml

{Paste the complete resulting .codex/config.toml here so the user can review and apply it.}

## Suggested next step

Run `audit` to confirm score improved. Remember that
`security.no_alwaysLoad_overuse`, `security.oauth_or_auth_documented`, and
all `crossref.*` checks stay N/A for Codex in V1 regardless of this fix —
they are not part of what this pass can improve.
