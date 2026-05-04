# MCP Examples — Good, Bad, and Inconsistent

Three reference `.mcp.json` configurations illustrating correct patterns,
anti-patterns, and cross-entity consistency issues.

---

## Example 1 — Well-structured configuration (3 servers)

```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://mcp.memory-service.com/v1",
      "oauth": {
        "clientId": "nakiros-memory-client",
        "callbackPort": 9001,
        "scopes": "memory:read memory:write"
      }
    },
    "local-tools": {
      "type": "stdio",
      "command": "${CLAUDE_PROJECT_DIR}/.claude/mcp-servers/local-tools.sh",
      "args": ["--project-dir", "${CLAUDE_PROJECT_DIR}"],
      "env": {
        "LOG_LEVEL": "info",
        "DB_URL": "${DATABASE_URL:-sqlite:///.nakiros/local.db}"
      },
      "alwaysLoad": true
    },
    "code-reviewer": {
      "type": "http",
      "url": "https://api.code-reviewer.io/mcp",
      "headersHelper": "${CLAUDE_PROJECT_DIR}/.claude/mcp-servers/get-reviewer-token.sh"
    }
  }
}
```

**Why this is good**:
- `memory` uses OAuth for authentication — Claude Code handles the flow automatically.
- `local-tools` uses `stdio` with `${VAR}` interpolation for all paths and secrets.
  The default `${DATABASE_URL:-sqlite://...}` prevents silent failures if the
  env var is unset.
- `code-reviewer` uses `headersHelper` for a custom auth flow.
- Only `local-tools` has `alwaysLoad: true` (needed every session for basic
  tooling). The other two are deferred until needed.
- No SSE transport. All remote servers use HTTPS.

**Cross-entity consistency**: In `settings.json`, hooks use
`mcp_tool` with `server: "memory"` — server exists. Subagent `backend.md` has
`mcpServers: [local-tools]` in frontmatter — server exists. Permissions include
`Allow(mcp__memory__*)` and `Deny(mcp__local-tools__destructive_*)` — both
servers exist.

---

## Example 2 — Anti-patterns (multiple issues)

```json
{
  "mcpServers": {
    "legacy-api": {
      "type": "sse",
      "url": "http://internal.legacy-api.corp/events",
      "headers": {
        "X-Api-Token": "sk-prod-a1b2c3d4e5f6",
        "Authorization": "Bearer hardcoded-token-DO-NOT-SHARE"
      },
      "alwaysLoad": true,
      "retries": 3
    },
    "data-warehouse": {
      "type": "http",
      "url": "http://dw.internal.corp/mcp",
      "env": {
        "SECRET_KEY": "my-super-secret",
        "DATABASE_PASSWORD": "hunter2"
      },
      "alwaysLoad": true
    },
    "analytics": {
      "type": "http",
      "url": "https://analytics.example.com/mcp",
      "alwaysLoad": true
    },
    "reporting": {
      "type": "websocket",
      "url": "wss://reporting.example.com/mcp"
    }
  }
}
```

**Issues**:
- `legacy-api`: `type: "sse"` is deprecated. URL uses `http://` (not HTTPS).
  Auth tokens hardcoded as plain text in `headers`. Unknown key `retries`.
- `data-warehouse`: URL uses `http://`. Secrets in `env` are plain text
  (`SECRET_KEY`, `DATABASE_PASSWORD`).
- `analytics`: no auth configured (no `oauth`, `headersHelper`, or
  `Authorization` header).
- `reporting`: `type: "websocket"` is not a valid transport type.
- All 3 valid servers have `alwaysLoad: true` (overuse — max 2 recommended).

**Checks that would fail**:
- `structure.no_unknown_server_keys` — `retries` on `legacy-api`
- `server.type_valid` — `websocket` on `reporting`
- `server.required_fields` — `reporting` has no `url` that matters since type is wrong
- `server.no_deprecated_sse` — `legacy-api` uses SSE
- `server.env_no_plain_secrets` — `legacy-api` headers + `data-warehouse` env
- `security.https_for_remote_servers` — `legacy-api` and `data-warehouse`
- `security.no_alwaysLoad_overuse` — 3 servers with `alwaysLoad: true`
- `security.oauth_or_auth_documented` — `analytics` has no auth

---

## Example 3 — Cross-entity inconsistencies

```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://mcp.memory-service.com/v1",
      "oauth": {
        "clientId": "my-app",
        "callbackPort": 9001,
        "scopes": "memory:read"
      }
    },
    "old-search": {
      "type": "http",
      "url": "https://api.old-search.io/mcp",
      "headers": {
        "Authorization": "Bearer ${OLD_SEARCH_TOKEN}"
      }
    }
  }
}
```

**Assumed project context (from `dot-claude-snapshot.json`)**:

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{ "type": "mcp_tool", "server": "new-search", "tool": "query" }]
    }]
  },
  "subagents": [
    { "name": "research-agent", "frontmatter": { "mcpServers": ["memory", "web-search"] } }
  ],
  "permissions": {
    "allow": ["mcp__memory__*", "mcp__new-search__*"]
  }
}
```

**Cross-entity issues**:

1. **`crossref.referenced_in_hooks`** — `new-search` is referenced in a
   `mcp_tool` hook but does NOT exist in `mcpServers`. The hook will silently
   fail.

2. **`crossref.referenced_in_subagents`** — `research-agent` lists `web-search`
   in its `mcpServers` frontmatter. `web-search` does NOT exist in `mcpServers`.

3. **`crossref.referenced_in_permissions`** — `mcp__new-search__*` in `allow`
   refers to `new-search` which does NOT exist in `mcpServers`.

4. **`crossref.unused_servers`** — `old-search` is configured in `.mcp.json`
   but referenced nowhere (no hooks, no subagents, no permissions). It appears
   to be dead config left from a migration.

**Recommended fix**: Add `new-search` and `web-search` to `mcpServers` (or
remove the stale references), and remove `old-search` if it's truly unused.
