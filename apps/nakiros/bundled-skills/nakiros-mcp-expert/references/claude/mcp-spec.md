# MCP Specification — Claude Code

**MCP** = Model Context Protocol. Enables Claude Code to connect to external
tools (databases, APIs, web services, local processes) and expose their
capabilities as callable tools.

---

## Configuration file

Project-scope MCP servers are configured in **`.mcp.json`** at the project
root (not inside `.claude/`). This file is the only target for this expert.

User-scope MCP servers can be configured in `~/.claude/settings.json` under
`mcpServers` — those are out of scope for this expert (V1).

---

## File format

```json
{
  "mcpServers": {
    "server-name": {
      "type": "http|sse|stdio",
      "url": "https://...",
      "command": "/path/to/server",
      "args": ["--port", "8080"],
      "env": { "KEY": "value" },
      "headers": { "Authorization": "Bearer ${TOKEN}" },
      "oauth": {
        "clientId": "...",
        "callbackPort": 8080,
        "scopes": "read write"
      },
      "headersHelper": "/path/to/auth-script.sh",
      "alwaysLoad": false
    }
  }
}
```

---

## Transport types

| Type | Description | Status |
|------|-------------|--------|
| `http` | Remote HTTP server (streamable HTTP transport) | **Recommended** |
| `sse` | Server-Sent Events | **DEPRECATED** by Anthropic — migrate to `http` |
| `stdio` | Local process via shell command | Supported |

---

## Required fields per transport type

| Transport | Required fields | Optional fields |
|-----------|----------------|-----------------|
| `http` | `url` | `headers`, `oauth`, `headersHelper`, `alwaysLoad` |
| `sse` | `url` | `headers`, `oauth`, `headersHelper`, `alwaysLoad` |
| `stdio` | `command` | `args`, `env`, `alwaysLoad` |

---

## All server keys (known set)

```
type           — transport type (required)
url            — server URL (http/sse only)
command        — executable path (stdio only)
args           — array of CLI arguments (stdio only)
env            — environment variables map (stdio only)
headers        — HTTP headers map (http/sse only)
oauth          — OAuth configuration object (http/sse only)
headersHelper  — path to shell script that prints headers as JSON (http/sse only)
alwaysLoad     — bool, exempt from tool-search deferral (all types)
```

Any key not in this list is unknown and may cause silent failures.

---

## Environment variable expansion

Expansion applies to: `command`, elements of `args`, values in `env`,
`url`, and values in `headers`.

| Syntax | Meaning |
|--------|---------|
| `${VAR}` | Expands to the value of env var VAR |
| `${VAR:-default}` | Expands to VAR or `default` if VAR is unset/empty |

**Example**:
```json
{
  "url": "https://${API_HOST}/mcp",
  "headers": { "Authorization": "Bearer ${API_TOKEN}" },
  "env": { "DB_URL": "${DATABASE_URL:-postgres://localhost/dev}" }
}
```

Secrets and credentials MUST use `${VAR}` interpolation — never hardcode them
in plain text.

---

## OAuth block (http/sse only)

```json
"oauth": {
  "clientId": "my-client-id",
  "callbackPort": 8080,
  "scopes": "read:data write:data"
}
```

OAuth is the recommended authentication mechanism for cloud-hosted MCP servers.
Claude Code handles the OAuth flow automatically when this block is present.

---

## `headersHelper` (http/sse only)

A path to a shell script that prints a JSON object of headers to stdout.
Used for custom authentication flows that don't fit the OAuth model.

```json
"headersHelper": "/path/to/get-token.sh"
```

The script must print valid JSON to stdout, e.g.:
```json
{"Authorization": "Bearer eyJ..."}
```

---

## `alwaysLoad` flag

When `true`, the server and all its tools are loaded at session start without
going through Claude Code's tool-search deferral. This consumes context tokens
at the start of every session.

**Use sparingly** — limit `alwaysLoad: true` to 1-2 servers that are truly
needed every session. All others should rely on deferral.

---

## Tool naming convention

MCP tools are exposed to Claude Code as:

```
mcp__<server-name>__<tool-name>
```

Examples:
- Server `memory` → tool `create_entities` → `mcp__memory__create_entities`
- Server `my-db` → tool `query` → `mcp__my-db__query`

This naming is used in:
- Permissions rules: `Allow(mcp__memory__*)`, `Deny(mcp__my-db__drop_table)`
- Hooks matchers: `"matcher": "mcp__memory__.*"` (PreToolUse/PostToolUse)
- CLAUDE.md instructions: "use `mcp__memory__create_entities` to..."

---

## Security best practices

1. **HTTPS only for http/sse transport.** Never use `http://` URLs for remote
   servers — all traffic is unencrypted and can be intercepted.

2. **Secrets via `${ENV_VAR}` interpolation.** API tokens, passwords, and
   credentials must never appear as plain text in `.mcp.json`. Use env var
   expansion and set variables in your shell environment or a `.env` file
   that is gitignored.

3. **OAuth for cloud servers.** Configure the `oauth` block for hosted MCP
   servers. Claude Code handles the browser-based auth flow automatically.

4. **`headersHelper` for custom auth.** When OAuth doesn't apply, use a
   `headersHelper` script. The script runs locally and injects auth headers
   at connection time.

5. **Limit `alwaysLoad: true`.** Each always-loaded server costs context
   tokens on every session. Reserve this for truly essential servers only
   (max 1-2).

6. **Avoid SSE transport.** Anthropic has deprecated SSE. If you have existing
   SSE servers, migrate to HTTP transport.

7. **Review cross-entity consistency.** Ensure that:
   - All servers referenced in hooks exist in `mcpServers`
   - All servers referenced in subagent frontmatter exist in `mcpServers`
   - All `mcp__server__*` permission rules reference real servers
   - Unused servers are removed or documented

---

## Relationship to other `.claude/` files

| File | Relationship to `.mcp.json` |
|------|-----------------------------|
| `.claude/settings.json` `hooks` | `mcp_tool` handlers and `mcp__server__*` matchers must match server names in `.mcp.json` |
| `.claude/subagents/*.md` | `mcpServers:` frontmatter lists servers the subagent can access — must exist in `.mcp.json` |
| `.claude/settings.json` `permissions` | `Allow/Deny(mcp__server__tool)` rules must reference real servers |
| `CLAUDE.md` | May document which MCP servers are available and how to use them |
