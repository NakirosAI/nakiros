# MCP Specification — Codex / ChatGPT

**MCP** = Model Context Protocol. Enables Codex to connect to external tools
(databases, APIs, web services, local processes) and expose their
capabilities as callable tools — same protocol as Claude Code, **different
native file format**.

This reference is derived strictly from Nakiros' Codex MCP adapter
(`apps/nakiros/src/services/provider-configuration/codex-mcp-adapter.ts` and
`mcp-validation.ts`). If this document and the adapter code ever disagree,
the adapter code is authoritative — flag the discrepancy, don't guess.

---

## Configuration file

Project-scope MCP servers are configured in **`.codex/config.toml`**, under
the `[mcp_servers.*]` TOML tables. This is **TOML, not JSON**, and the root
key is `mcp_servers` (snake_case) — **NOT** `.mcp.json` / `mcpServers` as in
Claude Code. Those are two entirely different files; do not confuse them.

The MCP slice of `.codex/config.toml` may only contain the `mcp_servers`
root key. Any other root-level key in the file is unrelated to MCP and is
out of scope for this expert (it belongs to the rest of the Codex config,
which this skill does not touch).

---

## File format

```toml
[mcp_servers.example-local-tools]
command = "${CLAUDE_PROJECT_DIR}/.claude/mcp-servers/local-tools.sh"
args = ["--project-dir", "${CLAUDE_PROJECT_DIR}"]

[mcp_servers.example-local-tools.env]
LOG_LEVEL = "info"
DATABASE_URL = "postgres://localhost/dev"

[mcp_servers.example-cloud-api]
url = "https://api.example.com/mcp"

[mcp_servers.example-cloud-api.http_headers]
Authorization = "Bearer some-token-value"
```

Each server is its own TOML table at `mcp_servers.<name>`. Nested maps
(`env`, `http_headers`) are rendered as their own nested table
(`mcp_servers.<name>.env`, `mcp_servers.<name>.http_headers`) — this is how
the Nakiros adapter serializes them, and is the expected on-disk shape.

---

## Allowed per-server keys (exhaustive)

```
command      — string, path to the local executable (stdio)
args         — array of strings, CLI arguments (stdio)
env          — string → string map, environment variables (stdio)
url          — string, remote server URL (http)
http_headers — string → string map, HTTP headers (http)
```

**Any other key is unknown** and not part of the Codex MCP contract. Unlike
Claude Code, Codex has **no** `type`, `transport`, `oauth`, `headersHelper`,
or `alwaysLoad` keys — see "Claude concepts that do NOT exist in Codex"
below.

---

## Transport is INFERRED, not declared

There is **no `type` or `transport` field** in the Codex MCP contract. The
adapter infers the transport from which keys are present:

- `url` is a non-empty string → **http**
- otherwise → **stdio** (and `command` is expected)

This is a meaningful difference from Claude Code, where `type` is explicit.
A Codex server table that sets both `url` and `command` is not rejected by
the adapter (both fields are preserved), but it is ambiguous in intent —
the transport still resolves to `http` because `url` wins. Flag this as a
warning during audits (see `mcp-checklist.md` → `server.transport_resolvable`).

---

## Required fields per transport

| Inferred transport | Required field |
|---------------------|-----------------|
| `http` (has `url`)   | `url` (non-empty string) |
| `stdio` (no `url`)   | `command` (non-empty string) |

---

## Claude concepts that do NOT exist in Codex

Do not carry these over when authoring or migrating a `.codex/config.toml`:

| Claude key/concept | Codex equivalent |
|---------------------|-------------------|
| `type` / `transport` (explicit) | None — inferred from `url` presence |
| `oauth` block | None — no OAuth flow in the Codex MCP contract |
| `headersHelper` (auth script) | None — put static values (or your own env-expanded string) directly in `http_headers` |
| `alwaysLoad` | None — no tool-search deferral concept in this contract |
| `headers` | Renamed: `http_headers` |
| `sse` transport | **Not representable.** Codex has no SSE support at all |

If any of `type`, `oauth`, `headersHelper`, `alwaysLoad`, or `headers` (the
Claude name, not `http_headers`) appear in a `.codex/config.toml` MCP table,
treat them as **unknown keys** — most likely copy-pasted from a Claude
`.mcp.json` by mistake. An explicit `sse` request (a `type = "sse"` key,
however invalid) is additionally flagged as the more specific
`server.no_sse` finding, because it signals an unrepresentable transport
rather than a merely-unknown key.

---

## Environment variable / secret values — unconfirmed interpolation

Claude Code's `.mcp.json` documents `${VAR}` / `${VAR:-default}` expansion
applied at connection time. **The Codex adapter code does not document or
implement any such expansion for TOML string values** — as far as the
adapter is concerned, `env` and `http_headers` values are opaque strings
written and read verbatim.

This is a known V1 gap: if Codex's own runtime does support some form of
environment interpolation for `.codex/config.toml`, it is not visible from
the adapter and this skill cannot assume it. Treat literal-looking secret
values as a genuine finding (see `server.env_no_plain_secrets` in the
checklist) rather than assuming an unverified interpolation syntax will
save you — recommend the user consult Codex's own docs for the actual
mechanism (env file injection at the OS level, etc.) before hardcoding.

---

## Server name pattern

Same rule as Claude: `^[A-Za-z0-9][A-Za-z0-9_-]*$` (validated by the shared
`validateCanonicalMcp` used by both adapters).

---

## Tool naming convention

Unchanged across providers — tools are still exposed as:

```
mcp__<server-name>__<tool-name>
```

---

## Security best practices (Codex)

1. **HTTPS only for remote (`url`-bearing) servers.** Never use `http://`.
2. **No plain-text secrets in `env` / `http_headers`.** There is no confirmed
   interpolation syntax for Codex — if you must reference a secret, prefer
   whatever mechanism Codex itself documents for injecting secrets into TOML
   config (outside the scope of this adapter) rather than hardcoding.
3. **Do not attempt to set `oauth`, `headersHelper`, or `alwaysLoad`.** These
   keys have no effect in Codex and are flagged as unknown/dead config.
4. **Avoid SSE.** Codex cannot represent it at all — there is no fallback.

---

## Relationship to other Codex-side files

Cross-entity checks (hooks, subagents, permissions, unused-server detection)
rely on a Claude-side `dot-claude-snapshot.json` produced by Nakiros before
invoking this skill. **No equivalent `dot-codex-snapshot.json` exists yet.**
Cross-entity checks are therefore **N/A for Codex in V1** — see
`mcp-checklist.md` for the exact taxonomy. Do not invent a Codex snapshot
format; wait for that infrastructure to land in a later increment.
