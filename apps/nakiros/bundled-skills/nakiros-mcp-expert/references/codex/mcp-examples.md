# MCP Examples (Codex) — Good and Bad `.codex/config.toml`

Reference Codex MCP configurations illustrating correct patterns and the
Codex-specific anti-patterns from `mcp-checklist.md`.

---

## Example 1 — Well-structured configuration (2 servers)

```toml
[mcp_servers.local-tools]
command = "${CLAUDE_PROJECT_DIR}/.claude/mcp-servers/local-tools.sh"
args = ["--project-dir", "${CLAUDE_PROJECT_DIR}"]

[mcp_servers.local-tools.env]
LOG_LEVEL = "info"

[mcp_servers.analytics-api]
url = "https://api.analytics.example.com/mcp"

[mcp_servers.analytics-api.http_headers]
Authorization = "Bearer set-this-via-your-own-secret-injection-mechanism"
```

**Why this is good**:
- `local-tools` has only `command`/`args`/`env` — resolves unambiguously to
  stdio.
- `analytics-api` has only `url`/`http_headers` — resolves unambiguously to
  http, and the URL is HTTPS.
- No `type`, `oauth`, `headersHelper`, or `alwaysLoad` keys anywhere — these
  don't exist in the Codex contract, and none were copy-pasted from a Claude
  config by mistake.
- No key named `token`/`key`/`secret`/`password` holds an obviously
  hardcoded literal (the `Authorization` value above is a placeholder the
  user is expected to replace via their own secret-injection approach, not
  a real committed credential).

**What would still be worth flagging in a real audit**: whether that
`Authorization` placeholder is in fact a real secret checked into version
control — the static script can only pattern-match, it cannot tell intent
apart from a genuinely hardcoded token. Read the file with judgement.

---

## Example 2 — Anti-patterns (Codex-specific)

```toml
[mcp_servers.legacy-api]
type = "sse"
url = "http://internal.legacy-api.corp/events"

[mcp_servers.legacy-api.http_headers]
Authorization = "Bearer sk-prod-a1b2c3d4e5f6"

[mcp_servers.data-warehouse]
url = "http://dw.internal.corp/mcp"
command = "/usr/local/bin/dw-tool"
alwaysLoad = true

[mcp_servers.data-warehouse.env]
DATABASE_PASSWORD = "hunter2"
```

**Issues**:
- `legacy-api`: carries a leftover `type = "sse"` key from a Claude config —
  Codex cannot represent SSE, and the key is otherwise just ignored
  (silently dropped into `extensions.codex`, doing nothing). URL is
  `http://`, not HTTPS. `Authorization` header holds a hardcoded token.
- `data-warehouse`: declares **both** `url` and `command` — ambiguous
  transport intent, resolves to `http` and silently ignores `command`. URL
  is `http://`, not HTTPS. Carries a leftover `alwaysLoad` key (no effect in
  Codex, just dead config). `DATABASE_PASSWORD` in `env` is a plain-text
  secret.

**Checks that would fail**:
- `structure.no_unknown_server_keys` — `type` on `legacy-api`, `alwaysLoad`
  on `data-warehouse`
- `server.transport_resolvable` — `data-warehouse` declares both `url` and
  `command`
- `server.no_sse` — `legacy-api` requests `type = "sse"`
- `server.env_no_plain_secrets` — `legacy-api` http_headers.Authorization,
  `data-warehouse` env.DATABASE_PASSWORD
- `security.https_for_remote_servers` — both `legacy-api` and
  `data-warehouse` use `http://`

**Checks that stay N/A regardless**: `security.no_alwaysLoad_overuse`
(no Codex equivalent to verify, even though the dead `alwaysLoad` key is
present — that's caught by the unknown-key check, not this one),
`security.oauth_or_auth_documented` (no Codex equivalent), and all four
`crossref.*` checks (no `dot-codex-snapshot.json` yet).

---

## Example 3 — Minimal valid stdio-only config

```toml
[mcp_servers.project-scripts]
command = "node"
args = [".claude/mcp/tools.js"]
```

No `env`, no `http_headers`, no remote servers. This is a fully valid,
minimal Codex MCP configuration — every applicable check passes, and the
security/crossref checks that require a remote server or a snapshot are
correctly `na` because there is nothing for them to evaluate.
