# MCP Audit Checklist — 14 Checks

Full rubrics for each check in `audit-manifest.json`. Severity levels:
**Critical** (C), **Warn** (W), **Info** (I).

---

## Section: Structure (3 checks)

### `structure.valid_json` — C

**Goal**: Ensure `.mcp.json` is parseable JSON.

**Pass**: `JSON.parse()` succeeds.
**Fail**: File missing, unreadable, or invalid JSON.
**N/A**: Special case — if the file does not exist at all, this is treated as
  `pass` with detail "no .mcp.json file" and all other checks become N/A.
  (Absence of `.mcp.json` is valid — project simply uses no MCP servers.)

**Rubric**: If the file exists but JSON is invalid, emit `fail` for this check
and `na` for all remaining checks.

---

### `structure.mcp_servers_object` — W

**Goal**: The `.mcp.json` file must contain a `mcpServers` key whose value is
a plain object (not an array, not a string, not null).

**Pass**: `mcpServers` key exists and `typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)`.
**Fail**: Key absent, or value is not a plain object.
**N/A**: If `structure.valid_json` failed/absent.

**Detail format**: `"mcpServers key missing"` or `"mcpServers is not an object (got: array)"`

---

### `structure.no_unknown_server_keys` — W

**Goal**: Each server definition should only use known, documented keys.
Unknown keys are likely typos and may be silently ignored by Claude Code.

**Known keys**: `type`, `url`, `command`, `args`, `env`, `headers`, `oauth`,
`headersHelper`, `alwaysLoad`.

**Pass**: Every server object has only keys from the known set.
**Fail**: At least one server has an unrecognised key.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty.

**Detail format**: `"server 'my-db' has unknown key(s): timeout, retries"`

---

## Section: Server Config (4 checks)

### `server.type_valid` — W

**Goal**: Every server must declare a `type` field from the set
`{http, sse, stdio}`.

**Pass**: All servers have `type` ∈ `{http, sse, stdio}`.
**Fail**: At least one server has a missing, null, or unrecognised `type`.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty.

**Detail format**: `"server 'my-server' has invalid type: 'ws' (expected http|sse|stdio)"`

---

### `server.required_fields` — W

**Goal**: Each server must have the field(s) required for its transport type.

| Transport | Required fields |
|-----------|----------------|
| `http` | `url` (non-empty string) |
| `sse` | `url` (non-empty string) |
| `stdio` | `command` (non-empty string) |

**Pass**: All servers have the required field(s) for their type.
**Fail**: At least one server is missing a required field or the field is empty.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty, or
  `server.type_valid` failed for that server.

**Detail format**: `"server 'my-api' (type=http) missing required field: url"`

---

### `server.no_deprecated_sse` — I

**Goal**: The `sse` transport type has been deprecated by Anthropic. Projects
should migrate to `http` transport.

**Pass**: No server uses `type: "sse"`.
**Fail**: At least one server uses `type: "sse"`.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty.

**Detail format**: `"server(s) using deprecated SSE transport: my-legacy-server, another-server"`
**Note**: Info severity — a warning to migrate, not a blocking error.

---

### `server.env_no_plain_secrets` — W

**Goal**: Sensitive values (API tokens, passwords, secrets) in `env` and
`headers` must use `${VAR}` interpolation, not plain text.

**Heuristic**: For each server, scan `env` and `headers` maps. If a key matches
`/(token|key|secret|password)/i` AND the value does NOT contain `${...}`,
the value is likely a plain-text secret.

**Pass**: No env/header key matching the secret heuristic has a plain-text value.
**Fail**: At least one key/value pair matches the heuristic.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty, or no
  servers have `env` or `headers`.

**Detail format**: `"server 'my-api': plain-text value for env key(s): API_TOKEN, AUTH_SECRET"`

**Note**: This is a heuristic. A key named `PUBLIC_KEY` for a non-secret RSA
public key would be a false positive. The agent should apply judgement for
ambiguous cases.

---

## Section: Security (3 checks)

### `security.https_for_remote_servers` — C

**Goal**: All `http` and `sse` transport servers must use HTTPS URLs to prevent
unencrypted transmission of data and credentials.

**Pass**: Every `http`/`sse` server has a `url` that starts with `https://`.
**Fail**: At least one `http`/`sse` server has a `url` starting with `http://`.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty, or no
  `http`/`sse` servers present.

**Detail format**: `"server(s) using non-HTTPS URL: my-server (http://internal.api/mcp)"`

---

### `security.no_alwaysLoad_overuse` — I

**Goal**: `alwaysLoad: true` loads all server tools at session start, consuming
context tokens on every session. More than 2 servers with `alwaysLoad: true`
is considered overuse.

**Pass**: 0, 1, or 2 servers have `alwaysLoad: true`.
**Fail**: 3 or more servers have `alwaysLoad: true`.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty.

**Detail format**: `"4 servers have alwaysLoad:true (max recommended: 2): server1, server2, server3, server4"`

---

### `security.oauth_or_auth_documented` — W

**Goal**: Remote (`http`/`sse`) servers should have authentication configured
to prevent unauthorized access. Authentication is configured via:
- `headers` with an `Authorization` key
- `oauth` block
- `headersHelper` script

**Pass**: Every `http`/`sse` server has at least one of: `oauth`, `headersHelper`,
or an `Authorization` key in `headers`.
**Fail**: At least one `http`/`sse` server has none of the above.
**N/A**: If `structure.valid_json` failed, or `mcpServers` is empty, or no
  `http`/`sse` servers.

**Note**: Some servers are publicly accessible and require no auth (e.g.
public APIs, local dev servers). The agent should apply judgement — a server
at `localhost` or `127.0.0.1` may legitimately have no auth.

**Detail format**: `"server(s) with no auth configured: my-cloud-api, another-service"`

---

## Section: Cross-entity (4 checks)

### `crossref.referenced_in_hooks` — W

**Goal**: Any MCP server referenced in hook configurations (as `mcp_tool`
handler server name or `mcp__<server>__*` matcher) must exist in `mcpServers`.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.hooks`.
For each `mcp_tool` handler, extract the `server` field. For each matcher
matching `mcp__(\w+)__.*`, extract the server name. Verify each against
`mcpServers` keys.

**Pass**: All hook-referenced server names exist in `mcpServers`.
**Fail**: At least one hook references a server not in `mcpServers`.
**N/A**: No hooks in snapshot, or no MCP server references in hooks.

---

### `crossref.referenced_in_subagents` — W

**Goal**: MCP servers listed in subagent frontmatter (`mcpServers:` key) must
exist in `.mcp.json`.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.subagents[]`.
For each subagent with `mcpServers` in its frontmatter, check that each listed
server name exists as a key in `mcpServers`.

**Pass**: All subagent-referenced server names exist in `mcpServers`.
**Fail**: At least one subagent references a server not in `mcpServers`.
**N/A**: No subagents in snapshot, or no subagent references MCP servers.

---

### `crossref.referenced_in_permissions` — W

**Goal**: Permission rules of the form `mcp__<server>__*` must reference MCP
servers that actually exist in `.mcp.json`.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.permissions`.
Extract all allow/ask/deny rules matching `mcp__(\w+)`. Check each extracted
server name against `mcpServers` keys.

**Pass**: All permission-referenced server names exist in `mcpServers`.
**Fail**: At least one permission rule references a server not in `mcpServers`.
**N/A**: No permissions in snapshot, or no `mcp__` permission rules.

---

### `crossref.unused_servers` — I

**Goal**: Servers configured in `.mcp.json` but never referenced anywhere
(not in hooks, subagents, or permissions) may be dead config — either outdated
or never integrated.

**How to evaluate**: Build the set of all server names referenced across:
- Hooks (as above)
- Subagent frontmatter (as above)
- Permissions rules (as above)
- CLAUDE.md content (search for `mcp__<server>` mentions)

Find servers in `mcpServers` not in this reference set.

**Pass**: Every configured server is referenced at least once elsewhere.
**Fail**: At least one server appears to be unused.
**N/A**: No servers configured, or snapshot not available.

**Note**: Info severity — unused servers are not an error. They may be newly
added, temporarily disabled, or used interactively. Flag for review only.

---

## Scoring

Total: **14 checks**. Score = number of `pass` results (N/A counts as pass).

| Score | Grade |
|-------|-------|
| 14/14 | Excellent — MCP configuration is correct, secure, and consistent |
| 12–13/14 | Good — minor issues only |
| 10–11/14 | Needs work — several warn-level findings |
| < 10/14 | Critical issues or significant security gaps |
