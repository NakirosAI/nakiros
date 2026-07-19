# MCP Audit Checklist — Codex — 14 Checks

Codex-adapted version of the Claude 14-check taxonomy (see
`references/claude/mcp-checklist.md`). Same total count and section shape,
so a report reader can compare the two providers at a glance — but several
checks are structurally **N/A for Codex** rather than dropped, because the
concepts they audit (OAuth, `alwaysLoad`, cross-entity snapshot) don't exist
yet on the Codex side. Full rubrics for each check in `audit-manifest.codex.json`.
Severity levels: **Critical** (C), **Warn** (W), **Info** (I).

---

## Section: Structure (3 checks)

### `structure.valid_toml` — C

**Goal**: Ensure `.codex/config.toml` is parseable TOML and its MCP slice
(root key `mcp_servers`) contains only that one root key.

**Pass**: The file parses, and the only root key present is `mcp_servers`
(or the file is absent).
**Fail**: File exists but fails to parse, OR the root object contains a key
other than `mcp_servers` (per the adapter, an unrelated root key makes the
whole MCP slice invalid — it is not simply ignored).
**N/A**: Special case — if the file does not exist at all, this is treated
as `pass` with detail "no .codex/config.toml file" and all other checks
become N/A (absence is valid — project simply uses no MCP servers).

---

### `structure.mcp_servers_table` — W

**Goal**: The `mcp_servers` key must be a TOML table (object), not a string,
array, or scalar.

**Pass**: `mcp_servers` key exists and is a table.
**Fail**: Key absent, or value is not a table.
**N/A**: If `structure.valid_toml` failed/absent.

**Detail format**: `"mcp_servers key missing"` or `"mcp_servers is not a table (got: array)"`

---

### `structure.no_unknown_server_keys` — W

**Goal**: Each server table should only use the 5 keys the Codex adapter
recognises. Unknown keys are silently preserved by the adapter under
`extensions.codex` but never round-tripped into a meaningful MCP field —
they are dead weight at best, a copy-paste mistake from Claude at worst.

**Allowed keys**: `command`, `args`, `env`, `url`, `http_headers`.

**Pass**: Every server table has only keys from the allowed set.
**Fail**: At least one server has an unrecognised key (this includes the
Claude-only keys `type`, `oauth`, `headersHelper`, `alwaysLoad`, `headers` —
see `mcp-spec.md` § "Claude concepts that do NOT exist in Codex").
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty.

**Detail format**: `"server 'my-db' has unknown key(s): type, alwaysLoad"`

---

## Section: Server Config (4 checks)

### `server.transport_resolvable` — W

**Goal**: Codex has no explicit `type`/`transport` field — the transport is
inferred purely from whether `url` is present (`http`) or absent (`stdio`,
expects `command`). Flag ambiguous shapes.

**Pass**: The server has exactly one clear signal — either `url` alone
(http) or `command` alone (stdio).
**Fail**: The server declares **both** `url` and `command` (ambiguous:
resolves to `http` per the adapter, silently ignoring `command`), or
declares **neither** (resolves to `stdio` with no `command` — this overlaps
with, and is also caught by, `server.required_fields`).
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty.

**Detail format**: `"server 'my-api' declares both url and command — transport resolves to http, command is ignored"`

---

### `server.required_fields` — W

**Goal**: Each server must have the field required by its inferred transport.

| Inferred transport | Required field |
|----------------------|-----------------|
| `http` (has `url`)    | `url` (non-empty string) |
| `stdio` (no `url`)    | `command` (non-empty string) |

**Pass**: All servers have the required field for their inferred transport.
**Fail**: At least one server is missing its required field, or the field
is present but empty.
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty.

**Detail format**: `"server 'my-tools' (inferred stdio) missing required field: command"`

---

### `server.no_sse` — W

**Goal**: The Codex MCP contract cannot represent the `sse` transport at
all — there is no `type` field to hold it and no SSE client in the adapter.
An explicit attempt to request it (e.g. a leftover `type = "sse"` key
copy-pasted from a Claude config) must be called out specifically, not just
folded into "unknown key".

**Pass**: No server table contains a `type` (or `transport`) key with the
literal value `sse` (case-insensitive).
**Fail**: At least one server has `type = "sse"` (or `transport = "sse"`).
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty.

**Detail format**: `"server 'legacy-api' requests the unsupported sse transport — Codex cannot represent SSE"`

**Note**: This finding is warn-level despite the transport being
unrepresentable, because the `type` key itself is silently ignored by the
adapter (moved to `extensions.codex`) rather than causing a hard parse
failure — so the practical symptom is "SSE quietly doesn't work", not a
crash. Still worth fixing before it confuses the next person who edits the
file expecting Claude-style semantics.

---

### `server.env_no_plain_secrets` — W

**Goal**: Same heuristic as Claude, applied to the Codex map names: scan
`env` and `http_headers` for keys matching `/(token|key|secret|password)/i`
whose values do not look like an interpolation placeholder (`${...}`).

**Important caveat** (see `mcp-spec.md`): unlike Claude, the Codex adapter
does not document or implement `${VAR}` expansion. This check still flags
literal secret-shaped values as a finding — a plain-text credential in a
committed config file is a bad practice on any provider — but do **not**
tell the user to "just use `${VAR}` interpolation" as the fix the way you
would for Claude; that syntax is unconfirmed for Codex. Recommend they
check Codex's own secret-injection mechanism instead.

**Pass**: No `env`/`http_headers` key matching the secret heuristic has a
value that looks like a literal secret.
**Fail**: At least one key/value pair matches the heuristic.
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty, or no
servers have `env` or `http_headers`.

**Detail format**: `"server 'my-api': plain-text value for key(s): http_headers.Authorization"`

---

## Section: Security (1 check + 2 explicit N/A)

### `security.https_for_remote_servers` — C

**Goal**: Any server with a `url` (i.e. inferred `http` transport) must use
`https://`.

**Pass**: Every server with a `url` has a value starting with `https://`.
**Fail**: At least one `url` starts with `http://`.
**N/A**: If `structure.valid_toml` failed, or `mcp_servers` is empty, or no
server declares `url`.

**Detail format**: `"server(s) using non-HTTPS URL: my-server (http://internal.api/mcp)"`

---

### `security.no_alwaysLoad_overuse` — **N/A for Codex (always)**

**Why N/A**: `alwaysLoad` is a Claude Code tool-search-deferral concept with
no equivalent in the Codex MCP contract. There is nothing to check. Emit
this as `na` with detail `"alwaysLoad has no Codex equivalent — nothing to check"`
on every run, regardless of file content. If a server table happens to
carry an `alwaysLoad` key anyway, that is caught by
`structure.no_unknown_server_keys`, not here.

---

### `security.oauth_or_auth_documented` — **N/A for Codex (always)**

**Why N/A**: Codex has no `oauth` block and no `headersHelper` script hook.
The only auth mechanism available is a manually-set value inside
`http_headers` (e.g. `Authorization = "..."`), which is already covered by
`server.env_no_plain_secrets` (flagging literal secrets) — there is no
separate "is auth configured at all" signal to check, because Codex has no
structured way to declare "this server requires auth" independent of
setting the header. Emit `na` with detail
`"oauth/headersHelper have no Codex equivalent — auth is just a plain http_headers entry, covered by server.env_no_plain_secrets"`.

---

## Section: Cross-entity (4 checks — all N/A for Codex V1)

### `crossref.referenced_in_hooks`, `crossref.referenced_in_subagents`, `crossref.referenced_in_permissions`, `crossref.unused_servers` — **N/A for Codex V1**

**Why N/A**: All four Claude cross-entity checks depend on reading
`dot-claude-snapshot.json`, which Nakiros generates from the `.claude/`
ecosystem (hooks, subagents, permissions, CLAUDE.md). **There is no
`dot-codex-snapshot.json` yet** — that infrastructure has not been built.

Do not invent one. Do not attempt to reuse `dot-claude-snapshot.json` for a
Codex target — the two providers' hooks/subagents/permissions systems are
not guaranteed to line up, and guessing would produce false findings.

Emit all four as `na` with detail
`"No dot-codex-snapshot.json yet — cross-entity checks are a known V1 limitation for Codex"`
and note this explicitly in the audit report's Notes section so the user
understands it's a gap, not a clean bill of health.

---

## Scoring

Total: **14 checks** (same shape as Claude, for side-by-side comparability).
Score = number of `pass` results (N/A counts as pass — same convention as
the Claude checklist).

| Score | Grade |
|-------|-------|
| 14/14 | Excellent for what V1 can verify — remember cross-entity + auth/alwaysLoad are structurally N/A, not verified-good |
| 12–13/14 | Good — minor issues only |
| 10–11/14 | Needs work — several warn-level findings |
| < 10/14 | Critical issues or significant security gaps |

Because 6 of the 14 checks (`security.no_alwaysLoad_overuse`,
`security.oauth_or_auth_documented`, and the 4 `crossref.*` checks) are
*always* `na` for Codex in V1, a Codex config can realistically top out
around a perceived "14/14" without those 6 dimensions having been verified
at all. **Always mention this ceiling explicitly in the report** — don't
let a high score read as a stronger guarantee than it is.
