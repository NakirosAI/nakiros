# MCP Fix Diff

**Target**: `{absolute path to .mcp.json}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/14`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Migrate legacy-api from SSE to HTTP transport"}
- **Source**: `{audit:server.no_deprecated_sse}`
- **Server path**: `mcpServers.legacy-api`
- **Diff**:
```diff
  "legacy-api": {
-   "type": "sse",
+   "type": "http",
    "url": "https://api.legacy.corp/mcp"
  }
```

### 2. {next edit — e.g. "Replace plain-text token with env var interpolation"}
- **Source**: `{audit:server.env_no_plain_secrets}`
- **Server path**: `mcpServers.my-api.headers`
- **Diff**:
```diff
  "headers": {
-   "Authorization": "Bearer sk-prod-a1b2c3d4"
+   "Authorization": "Bearer ${MY_API_TOKEN}"
  }
```

### 3. {e.g. "Fix non-HTTPS URL on data-warehouse"}
- **Source**: `{audit:security.https_for_remote_servers}`
- **Server path**: `mcpServers.data-warehouse`
- **Diff**:
```diff
  "data-warehouse": {
    "type": "http",
-   "url": "http://dw.internal.corp/mcp"
+   "url": "https://dw.internal.corp/mcp"
  }
```

## Edits skipped

- `{finding type}` — reason: `{e.g. "ambiguous intent — localhost server may intentionally have no auth"}`

## Resulting .mcp.json

{Paste the complete resulting .mcp.json here so the user can review and apply it.}

## Suggested next step

Run `audit` to confirm score improved. If `crossref.referenced_in_hooks` is
still failing, update the stale server name in `.claude/settings.json hooks`.
If `server.env_no_plain_secrets` required env var changes, add the variables
to your shell environment or `.env` file (gitignored).
