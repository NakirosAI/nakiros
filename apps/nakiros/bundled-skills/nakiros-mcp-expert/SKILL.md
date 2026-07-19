---
name: nakiros-mcp-expert
description: "Creates, audits, and fixes the MCP server configuration for any project — Claude Code's .mcp.json or Codex's .codex/config.toml — following each provider's official MCP conventions. Use when bootstrapping a new MCP configuration, auditing an existing one against best practices, or patching it based on Nakiros friction signals or cross-entity inconsistencies."
user-invocable: true
---

# MCP Expert — Nakiros

> Two modes:
> - **Interactive** (user invokes `/nakiros-mcp-expert` with a question) — discover with the user.
> - **Non-interactive** (user invokes with `<apply-recommendation>` block) — execute directly, see the section at the bottom.

You create, audit, fix, and improve the project's MCP server configuration.
There is **one** expert reasoning about MCP *intent* — which servers a
project wants, security posture, cross-refs — for **both** providers Nakiros
supports:

- **Claude Code** → `.mcp.json` at the project root (JSON).
- **Codex / ChatGPT** → `.codex/config.toml`, `[mcp_servers.*]` tables (TOML).

Only the file format, discovery path, and a handful of provider-specific
keys differ. Never split this into two experts, and never guess the
provider from file content or file extension — see "Provider is an
explicit input" below.

This is one of seven `.claude/`-ecosystem experts shipped by Nakiros. Sister
experts handle CLAUDE.md, rules, subagents, hooks, permissions, and output
styles — all Claude-only today. Stay within scope: this skill ONLY touches
the project's MCP server configuration file (whichever one the active
provider uses). Out of scope: `.claude/settings.json` (hooks, permissions),
subagent markdown files, CLAUDE.md, output styles, skills, and any
non-MCP part of Codex's own configuration file.

**Key structural facts**:
- Both target files are standalone at the project root (`.mcp.json`) or
  under a root-level dotfolder (`.codex/config.toml`) — **never** inside
  `.claude/`.
- The audit is **singleton** per provider: one audit covers the entire MCP
  slice of that provider's file.
- Project scope only (V1) for both providers — user-scope MCP config
  (`~/.claude/settings.json` for Claude, the Codex equivalent) is out of
  scope.
- This skill is designed to run **standalone**, without the Nakiros daemon.
  A user can install it and run `/nakiros-mcp-expert` in a plain Claude or
  Codex session. Everything needed to reason about either file format lives
  inside this skill's `references/` and `scripts/` — nothing here depends on
  the daemon being present or its `node_modules` being installed.

## Provider is an explicit input

Every command you run operates against exactly one provider: `claude` or
`codex`. **Never infer the provider from file content or extension** — this
mirrors the rule enforced by Nakiros' own configuration adapters
(`ProviderConfigurationTarget.provider` in `packages/shared`, which is
always an explicit field, never derived).

Sources for `provider`, in priority order:
1. An explicit `provider:` value in an `<apply-recommendation>` block (see
   bottom of this file).
2. The Nakiros run target, if this skill was invoked by Nakiros for a
   specific project/provider pair.
3. What the user tells you in chat ("audit my Codex MCP config", "create a
   `.mcp.json`").
4. **Default: `claude`** — for backward compatibility with existing
   callers that don't pass a provider at all.

If ambiguous and none of the above resolves it, ASK the user which provider
they mean before touching any file. Do not guess from which dotfolder
happens to exist on disk — a project can have both `.mcp.json` and
`.codex/config.toml` at once, or neither yet (on `create`).

## Output language

- **Conversation language** — match whatever the user is writing in. Switch if
  they switch.
- **Artefact language** (audit reports, fix diffs, scripts) — **default to
  English** regardless of conversation language.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Provider | See "Provider is an explicit input" above | Always |
| Target config file | Claude: auto-locate `.mcp.json` at project root. Codex: auto-locate `.codex/config.toml` at project root | Always |
| MCP spec | `references/claude/mcp-spec.md` or `references/codex/mcp-spec.md` | Always |
| Audit checklist | `references/claude/mcp-checklist.md` or `references/codex/mcp-checklist.md` | On `audit` |
| Friction data | `{project}/.nakiros/frictions/aggregate.json` | On `fix` |
| Project context | `dot-claude-snapshot.json` (cwd root) — **Claude only, see below** | On `audit`, `fix` when provider is `claude` |
| MCP template | `assets/templates/mcp-template.json` (Claude) or `assets/templates/mcp-template.codex.toml` (Codex) | On `create` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | `.mcp.json` or `.codex/config.toml` (created or replaced) | Brief summary + diff |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` (**same three filenames for both providers** — content and taxonomy differ) | One-line score |
| `fix` | Target file + `outputs/fix-diff.md` | Diff |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "audit .mcp.json" (in project /Users/foo/my-app)  — provider: claude (default)
Reads:   dot-claude-snapshot.json + /Users/foo/my-app/.mcp.json
         + references/claude/mcp-checklist.md
Output:  outputs/audit-manifest.json, outputs/audit-progress.jsonl, outputs/audit-report.md
Chat:    "Score 11/14 — full report saved to outputs/audit-report.md"
```

```
Input:   "audit the Codex MCP config" (in project /Users/foo/my-app)  — provider: codex
Reads:   /Users/foo/my-app/.codex/config.toml + references/codex/mcp-checklist.md
         (no dot-claude-snapshot.json — cross-entity checks are N/A for Codex V1)
Output:  outputs/audit-manifest.json, outputs/audit-progress.jsonl, outputs/audit-report.md
Chat:    "Score 8/14 (6 N/A by design — see report) — full report saved to outputs/audit-report.md"
```

```
Input:   "create an MCP config with a local tools server and a cloud API server" — provider: claude
Reads:   references/claude/mcp-spec.md + assets/templates/mcp-template.json
Output:  /Users/foo/my-app/.mcp.json
Chat:    "Created .mcp.json with 2 servers. See .mcp.json"
```

## Cross-entity context — Claude only

Nakiros writes a `dot-claude-snapshot.json` file at the root of your working
directory before invoking you, on Claude runs. **Read it at the start of
every `audit` and `fix` run when `provider: claude`** (small JSON — one
`Read` call suffices).

```
Read: dot-claude-snapshot.json
```

The snapshot gives you the full `.claude/` ecosystem. Use it for:

1. **Hooks consistency** (`crossref.referenced_in_hooks`) — for each `mcp_tool`
   handler in hooks (`snapshot.hooks`), check that the `server` field names a
   server that exists in `mcpServers`. Also check `mcp__<server>__*` regex
   matchers in `PreToolUse`/`PostToolUse` hook matchers.

2. **Subagent consistency** (`crossref.referenced_in_subagents`) — for each
   subagent in `snapshot.subagents[]`, check that every server listed in its
   `mcpServers:` frontmatter key exists in `mcpServers`.

3. **Permissions consistency** (`crossref.referenced_in_permissions`) — for
   each rule in `snapshot.permissions.allow/ask/deny` matching `mcp__<server>`,
   check that the server name exists in `mcpServers`.

4. **Unused servers** (`crossref.unused_servers`) — identify servers in
   `mcpServers` that are not referenced in hooks, subagents, permissions, or
   `snapshot.claudemd.content`. Flag as potential dead config.

5. **CLAUDE.md constraints** — if `snapshot.claudemd.content` mentions
   restrictions relevant to MCP (e.g. "no network calls"), flag them in the
   report Notes section.

**When `provider: codex`**: skip this entire section. There is no
`dot-codex-snapshot.json` yet — the four `crossref.*` checks are always
`na` for Codex in V1 (see `references/codex/mcp-checklist.md`). Do not
attempt to reuse the Claude snapshot for a Codex target.

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | Claude only — on `audit`, `fix` — read first |
| 2 | `references/claude/mcp-spec.md` or `references/codex/mcp-spec.md` | Always, per provider |
| 3 | `references/claude/mcp-checklist.md` or `references/codex/mcp-checklist.md` | On `audit`, `create` (validation step), per provider |
| 4 | `assets/templates/mcp-template.json` or `assets/templates/mcp-template.codex.toml` | Before `create`, per provider |
| 5 | `assets/outputs/audit-report.md` (Claude) or `assets/outputs/audit-report.codex.md` (Codex) | Before `audit` — EXACT format to follow |
| 6 | `audit-manifest.json` (Claude) or `audit-manifest.codex.json` (Codex), at skill root | Before `audit` — taxonomy template consumed by the static-check script |
| 7 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists), either provider |

## MCP quality checklist — 14 checks per provider

Full rubrics: `references/claude/mcp-checklist.md` (Claude) or
`references/codex/mcp-checklist.md` (Codex). Both taxonomies have the same
shape (Structure / Server Config / Security / Cross-entity, 14 checks
total) so a report reader can compare providers at a glance — but the
checks themselves, and which ones are structurally N/A, differ.

### Claude (summary)

**Structure (3)**: `structure.valid_json` (C), `structure.mcp_servers_object`
(W), `structure.no_unknown_server_keys` (W — known keys: `type`, `url`,
`command`, `args`, `env`, `headers`, `oauth`, `headersHelper`, `alwaysLoad`).

**Server Config (4)**: `server.type_valid` (W — `type` ∈ `{http, sse, stdio}`),
`server.required_fields` (W), `server.no_deprecated_sse` (I),
`server.env_no_plain_secrets` (W — `${...}` interpolation required for
secret-shaped keys).

**Security (3)**: `security.https_for_remote_servers` (C),
`security.no_alwaysLoad_overuse` (I — max 1-2), `security.oauth_or_auth_documented` (W).

**Cross-entity (4)**: `crossref.referenced_in_hooks`,
`crossref.referenced_in_subagents`, `crossref.referenced_in_permissions`
(all W), `crossref.unused_servers` (I) — all read from
`dot-claude-snapshot.json`.

### Codex (summary)

**Structure (3)**: `structure.valid_toml` (C — parseable TOML, MCP slice has
no unrelated root key), `structure.mcp_servers_table` (W),
`structure.no_unknown_server_keys` (W — known keys: `command`, `args`,
`env`, `url`, `http_headers` **only**).

**Server Config (4)**: `server.transport_resolvable` (W — exactly one of
`url`/`command`, transport is *inferred*, there is no `type` field),
`server.required_fields` (W), `server.no_sse` (W — Codex cannot represent
SSE at all, unlike Claude where it's merely deprecated),
`server.env_no_plain_secrets` (W — same heuristic, but `${...}`
interpolation is **not confirmed** for Codex, see `references/codex/mcp-spec.md`).

**Security (1 active + 2 always-N/A)**: `security.https_for_remote_servers`
(C). `security.no_alwaysLoad_overuse` and `security.oauth_or_auth_documented`
are **always `na`** — `alwaysLoad`, `oauth`, and `headersHelper` have no
Codex equivalent.

**Cross-entity (4, all always-N/A for V1)**: all four `crossref.*` checks
are always `na` — there is no `dot-codex-snapshot.json` yet.

**N/A semantics (both providers)**: if the target file does not exist, the
top structural check (`structure.valid_json` / `structure.valid_toml`) is
`pass` (absence is valid) and everything else is `na`. If that top check
fails (invalid syntax, or — Codex only — an unrelated root key in the MCP
slice), all remaining checks are `na`. If the servers map/table is empty,
all `server.*` and `security.*` checks are `na`.

## Auditing the MCP configuration

**Every audit MUST produce three artefacts** (same pattern as skill-factory,
same three filenames for both providers):
- `outputs/audit-manifest.json` — static taxonomy of the 14 checks for the
  active provider (with target injected)
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**, passing `--provider`:
   ```
   node "$(realpath ~/.claude/skills/nakiros-mcp-expert)/scripts/run-static-checks.mjs" \
     --provider claude|codex \
     --mcp-config <absolute-path-to-.mcp.json-or-.codex/config.toml> \
     --output-dir outputs
   ```
   Claude: writes `audit-manifest.json` (from the skill's Claude taxonomy)
   and seeds `audit-progress.jsonl` with 10/14 deterministic checks — the 4
   cross-entity checks are left for you.
   Codex: writes `audit-manifest.json` (from the skill's Codex taxonomy,
   note the *output* filename is the same regardless of provider) and seeds
   `audit-progress.jsonl` with 8/14 real checks plus 6 always-`na` checks
   already filled in (`security.no_alwaysLoad_overuse`,
   `security.oauth_or_auth_documented`, and the 4 `crossref.*`) — **nothing
   is left for you to evaluate on the Codex path**; skip straight to step 5.
   Read the JSONL after running the script — do not re-evaluate already-done
   checks.

2. **Read the target file** being audited in full (if it exists and parses).

3. **Claude only** — read `dot-claude-snapshot.json` to resolve cross-entity
   checks. **Codex** — skip this step; there is nothing to resolve (all 4
   `crossref.*` checks were already emitted as `na` by the script).

4. **Claude only** — append one JSONL line per remaining judgement-based
   check. Each line:
   ```json
   { "checkId": "<slug from manifest>", "result": "pass" | "fail" | "na", "detail": "<one short sentence>" }
   ```
   Remaining checks after the static script:
   `crossref.referenced_in_hooks`, `crossref.referenced_in_subagents`,
   `crossref.referenced_in_permissions`, `crossref.unused_servers`.
   Apply judgement:
   - For `security.oauth_or_auth_documented`: the static script already emitted
     a result; if the agent believes a server without auth is intentionally public
     (localhost, 127.0.0.1), override by appending a `pass` line for that server.
   - For `crossref.unused_servers`: search `snapshot.claudemd.content` for
     `mcp__<server>` mentions in addition to hooks/subagents/permissions.

   **Codex**: no step 4 — go directly to step 5.

5. **Write the markdown report** to `outputs/audit-report.md` following
   `assets/outputs/audit-report.md` (Claude) or
   `assets/outputs/audit-report.codex.md` (Codex). Use JSONL outcomes as
   source of truth. Last `result` value per `checkId` wins (append-only
   semantics).

   **Severity rubric for "Priority fixes":**
   - **Critical** — config is broken: invalid syntax, or (Claude) http/sse
     using `http://` URLs, or (Codex) a `url`-bearing server using `http://`
     or an unrelated root key in the MCP slice.
   - **Important** — security/quality: servers-map missing, unknown keys,
     invalid/ambiguous transport, missing required fields, plain-text
     secrets, no auth on remote servers (Claude), stale cross-refs (Claude).
   - **Minor** — polish: SSE deprecated/unsupported, alwaysLoad overuse
     (Claude), unused servers (Claude).

   **Codex-specific note for the report**: always state the "V1 ceiling"
   explicitly (6 of 14 checks are structurally N/A) so a high score doesn't
   read as a stronger guarantee than it is — see
   `references/codex/mcp-checklist.md` § Scoring.

6. **Chat summary** — one line only: `"Score X/14 — full report saved to
   outputs/audit-report.md"`. Do NOT paste the report.

## Creating the MCP configuration

### Step 1 — Understand the project's MCP needs

Determine what external tools the agent needs access to. Common patterns:
- **Local tooling only** — stdio servers for project-specific scripts
- **Cloud API integration** — remote servers with auth
- **Hybrid** — one always-available stdio server + deferred cloud servers

### Step 2 — Draft from template

**Claude**: read `assets/templates/mcp-template.json`. Fill in transport
type (`http`/`stdio`), authentication (`oauth`, `headersHelper`, or
`${VAR}` headers), `alwaysLoad: true` only for 1-2 servers truly needed
every session, env vars for secrets.

**Codex**: read `assets/templates/mcp-template.codex.toml`. Fill in `url`
(remote) or `command`/`args` (local) — transport is inferred, do not add a
`type` key. Put auth values directly under `[mcp_servers.<name>.http_headers]`
(there is no `oauth`/`headersHelper` concept). Do not add `alwaysLoad`.

### Step 3 — Validate against checklist

Walk all 14 checks for the active provider. Fix any critical or warn ❌
before delivering.

### Step 4 — Check cross-entity consistency — Claude only

Read `dot-claude-snapshot.json`. If subagents already reference MCP
servers, ensure the server names match what you're creating. If
permissions rules exist for `mcp__*`, ensure they reference your new
server names. **Codex**: skip — no snapshot exists yet.

### Step 5 — Deliver

Write the target file to the project root (`.mcp.json`) or
`.codex/config.toml` (creating the `.codex/` directory if needed). Chat
output: `"Created {file} with {N} server(s). See {file}"`. Paste only the
relevant fragment if updating an existing file.

### Step 6 — Sync CLAUDE.md routing tables — Claude only

Invoke the claudemd-expert sync mode for uniformity with sister experts.
MCP servers are not in today's auto-generated tables (which cover subagents
and rules), so this is a no-op for the MCP block today — but the sync may
be extended in the future:

```
Skill('nakiros-claudemd-expert', 'sync')
```

Safe to call: no-op if the project's CLAUDE.md does not opt in via nakiros
markers. **Codex**: skip this step entirely — CLAUDE.md is a Claude-only
concept.

## Fixing the MCP configuration from frictions

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md`. Security findings first.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`.
   Look for frictions mapped to MCP misfires (server not found, auth errors,
   connection drops, timeout issues, and — Claude only — stale cross-refs).
3. **Existing target file** — read before modifying.

If `aggregate.json` doesn't exist, ASK: *"No friction aggregate found. Want me
to fix from audit findings only?"*

### Apply minimal edits

One finding → one targeted edit. Do not rewrite the whole file.

### Live progress artefacts (Nakiros-invoked only)

Write `outputs/fix-diff.md` following `assets/outputs/fix-diff.md` (Claude)
or `assets/outputs/fix-diff.codex.md` (Codex). Do NOT add a `ts` field —
Nakiros stamps it.

### Sync CLAUDE.md routing tables — Claude only

After applying the fix, invoke the claudemd-expert sync mode for uniformity
with sister experts (no-op for MCP servers today):

```
Skill('nakiros-claudemd-expert', 'sync')
```

**Codex**: skip this step.

## Best practices for MCP configuration

### Claude
- **HTTPS only for http/sse transport.** Never use `http://` for remote servers.
- **Use `${ENV_VAR}` for all secrets.** Never plain text. Env var expansion
  applies at connection time.
- **OAuth for cloud servers.** Configure the `oauth` block for hosted MCP
  servers — Claude Code handles the browser-based auth flow automatically.
- **`headersHelper` for custom auth flows.** A shell script that prints auth
  headers as JSON. Keep it gitignored if it embeds secrets.
- **Limit `alwaysLoad: true`** to 1-2 servers truly needed every session.
- **Avoid SSE transport.** Deprecated by Anthropic — migrate to HTTP.
- **Review cross-entity consistency** after renaming/removing a server —
  hooks, subagents, and permission rules must follow.
- **Remove unused servers.**
- **Use descriptive server names** — they appear in tool calls as
  `mcp__<server>__<tool>`.

### Codex
- **HTTPS only for `url`-bearing servers.** Same rule, no `type` field to
  gate it on — any `url` value must be `https://`.
- **Do not add `type`, `oauth`, `headersHelper`, or `alwaysLoad`.** None of
  these exist in the Codex MCP contract; they end up as inert unknown keys.
- **Do not request `sse`.** Codex cannot represent it in any form.
- **Put auth values under `http_headers`, not `headers`.** The key is
  renamed.
- **Do not assume `${VAR}` interpolation for `env`/`http_headers` values.**
  Unconfirmed for Codex — see `references/codex/mcp-spec.md`. Point the
  user to Codex's own secret-injection mechanism instead of promising
  interpolation will work.
- **One clear transport signal per server.** Set `url` OR `command`, not
  both — the adapter resolves `url` present → http regardless, silently
  ignoring a stray `command`.

## Evaluating the MCP configuration (evals)

Test cases for `eval create` should cover, per provider:

**Claude**:
- Valid `.mcp.json` with 2 servers (should score 14/14)
- No `.mcp.json` file (should emit `structure.valid_json: pass`, rest `na`)
- `.mcp.json` with invalid JSON (should detect `structure.valid_json: fail`)
- `type: "sse"` server (should detect `server.no_deprecated_sse: fail`)
- `http://` URL on http server (should detect `security.https_for_remote_servers: fail`)
- Plain-text token in headers (should detect `server.env_no_plain_secrets: fail`)
- `mcp_tool` hook referencing a server not in `mcpServers` (should detect
  `crossref.referenced_in_hooks: fail`)

**Codex**:
- Valid `.codex/config.toml` with 2 servers (one stdio, one http) — should
  score 8/8 on the active checks, 6 `na`
- No `.codex/config.toml` file (should emit `structure.valid_toml: pass`, rest `na`)
- Invalid TOML (should detect `structure.valid_toml: fail`)
- A leftover `type = "sse"` key (should detect `server.no_sse: fail` and
  also `structure.no_unknown_server_keys: fail`)
- `http://` URL (should detect `security.https_for_remote_servers: fail`)
- A server with both `url` and `command` (should detect
  `server.transport_resolvable: fail`)
- Plain-text value in `http_headers` (should detect
  `server.env_no_plain_secrets: fail`)

When authoring eval fixtures for this skill, always record which provider
each fixture targets — `eval create` output should tag test cases with
`provider: claude | codex`.

Do NOT auto-create evals on `create`. Propose at the end.

## Gotchas

### Both providers
- **The MCP config file lives outside `.claude/`, at (or under) the project
  root.** Claude: `$CLAUDE_PROJECT_DIR/.mcp.json`. Codex:
  `$CLAUDE_PROJECT_DIR/.codex/config.toml`.
- **Server names appear verbatim in tool names** as `mcp__<server>__<tool>`.
  If you rename a server, all permission rules, hook matchers, and subagent
  frontmatter referencing it must be updated (Claude — see cross-entity
  section; Codex has no equivalent checks yet, but the tool-naming
  convention is unchanged).
- **The static-check script (`scripts/run-static-checks.mjs`) and everything
  under `scripts/lib/` are dependency-free** — only `node:*` built-ins.
  Never add an `import` from a third-party package here, even one the
  daemon already depends on (like `confbox`) — the skill must run in a
  plain CLI environment with no `node_modules` guaranteed.

### Claude-specific
- **`sse` is deprecated but still parses.** Always flag SSE servers in
  audit reports; migration is recommended, not (yet) a hard error.
- **`alwaysLoad: true` costs context.** Every always-loaded server's tools
  are injected into the system prompt at session start.
- **Env var expansion applies at connection time, not at file parse time.**
  Use `${VAR:-default}` for safe fallbacks on non-secret values.
- **`headers` is NOT available for `stdio` servers**; `env` is NOT
  available for `http`/`sse` servers.
- **`command` in stdio accepts shell-style `${VAR}`** in the path,
  resolved at connection time.

### Codex-specific
- **`.codex/config.toml` is TOML, and the root key is `mcp_servers`
  (snake_case), not `mcpServers`.** Do not confuse the two files or their
  key casing when helping a user migrate one to the other.
- **There is no `type`/`transport` field.** Transport is inferred: `url`
  present → http, otherwise stdio (expects `command`). Never write a `type`
  key into a Codex server table — it will just become dead unknown config.
- **`sse` cannot be represented at all**, not even as a deprecated option.
  If a user asks to configure an SSE-only remote MCP server for Codex, tell
  them plainly that this provider cannot do it (unlike Claude, where SSE at
  least still works).
- **The header key is `http_headers`, not `headers`.** This is the single
  most common typo when porting a Claude config to Codex.
- **No `oauth`, no `headersHelper`, no `alwaysLoad`.** These are Claude-only
  concepts; do not try to reproduce them in a Codex table — there is
  nowhere for them to go except `extensions.codex` (inert, per the adapter).
- **`env`/`http_headers` values have no confirmed interpolation syntax.**
  Don't promise `${VAR}` will expand for Codex the way it does for Claude —
  the adapter treats these as opaque strings. See `references/codex/mcp-spec.md`.
- **The bounded TOML reader (`scripts/lib/toml-reader.mjs`) is not a full
  TOML parser.** It supports exactly the subset the `mcp_servers` slice
  needs: single-line string/array scalars, nested table headers, `#`
  comments. Multi-line arrays, inline tables (`{ a = 1 }`), and
  array-of-tables (`[[...]]`) are NOT supported — if the script reports a
  parse failure, read the file yourself before concluding it's genuinely
  invalid; it may just be outside this reader's bounded subset.
- **An unrelated root key in `.codex/config.toml` makes the MCP slice
  invalid**, per the adapter (it does not silently ignore it). If the file
  also contains other Codex configuration outside `mcp_servers`, that's
  fine and expected — but if a stray *root-level* key appears that isn't
  `mcp_servers` when you parse just the MCP-relevant excerpt you're
  auditing, treat it as a `structure.valid_toml` failure, not a warning.

## Available commands

### MCP configuration management
- **"create"** → Create a new MCP config at the project root, for the
  active provider
- **"audit"** → Audit the full MCP config against the 14-check list for
  the active provider
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback

### MCP configuration evaluation
- **"eval create"** → Create test cases + fixtures (tag each with `provider`)
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by `/nakiros-mcp-expert edit`. The user wants to **modify the
existing MCP configuration conversationally**, without an audit driving the
changes.

1. Read the target file (`.mcp.json` or `.codex/config.toml`, per the
   active provider) at its project-root path to understand what currently
   exists.
2. Wait for the user's first message describing what to change.
3. Propose changes (Write/Edit tools directly on the target file — Nakiros
   runs you with project-tree permissions), explain trade-offs, iterate.
   Always write valid JSON (Claude) or valid TOML (Codex) — respect each
   provider's key names (`headers` vs `http_headers`, no `type` key for
   Codex, etc.).
4. Re-read the file after each substantive change to confirm the in-context
   view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not
   autonomous.

No findings file, no audit manifest. The user's chat is the spec. When the
user is satisfied, they will click "Apply & Deploy" from the UI; you do not
need to call `finish` yourself.

## Applying a Nakiros recommendation (non-interactive)

When the user prompt **starts with** `<apply-recommendation>` and ends with
`</apply-recommendation>`, the agent has already produced a complete spec —
your job is to write the artefact directly without discovery.

### How to read the block

The block contains:
- `artifactType: mcp` — confirms this skill is being invoked correctly.
- `action: fix | create`.
- `provider: claude | codex` — **explicit, required for MCP recommendations
  going forward.** If this field is absent (older recommendations predating
  provider-awareness), default to `claude`.
- `target: <id>` — for `create`, the new server's name (e.g. `"my-tools"`);
  for `fix`, the name of the existing server to modify.
- `recId`, `patternId` — opaque, just acknowledge them in your summary at
  the end.

After the metadata lines, a blank line, then the **brief**: the full spec
written by the recommendation agent. Treat it as authoritative — it will
describe the server in provider-neutral terms (command/args/env or url/auth)
and it's your job to render it into the correct native shape.

### What you MUST do

1. **Do not ask questions.** Every detail is in the block. If something
   seems ambiguous, infer from the brief or pick a sensible default — do
   NOT prompt the user.
2. **For `action: create`, `provider: claude`**: read the current
   `.mcp.json` (create it as `{"mcpServers":{}}` if absent), add the new
   server entry described in the brief under `mcpServers.<target>`, and
   write the entire file back as valid JSON.
3. **For `action: create`, `provider: codex`**: read the current
   `.codex/config.toml` (create the `.codex/` directory and a file
   containing just `[mcp_servers.<target>]` if absent), add the new
   `[mcp_servers.<target>]` table (plus `[mcp_servers.<target>.env]` /
   `[mcp_servers.<target>.http_headers]` sub-tables as needed) described in
   the brief, and write the entire file back as valid TOML using only the
   allowed keys (`command`, `args`, `env`, `url`, `http_headers`) — never
   `type`, `oauth`, `headersHelper`, or `alwaysLoad`.
4. **For `action: fix`, `provider: claude`**: read the current `.mcp.json`,
   locate `mcpServers.<target>`, apply the changes described in the brief,
   and write the entire file back as valid JSON. Preserve all other server
   entries unchanged.
5. **For `action: fix`, `provider: codex`**: read the current
   `.codex/config.toml`, locate `mcp_servers.<target>` (and its
   `env`/`http_headers` sub-tables), apply the changes described in the
   brief, and write the entire file back as valid TOML. Preserve all other
   server tables unchanged.
6. **End your turn with a one-line summary** of what you wrote, including
   the absolute path and the provider. Examples:
   `Added mcpServers.my-tools (stdio, command: node .claude/mcp/tools.js) to .mcp.json.`
   `Added mcp_servers.my-tools (stdio, command: node .claude/mcp/tools.js) to .codex/config.toml.`

### When NOT to apply non-interactively

If the block is malformed (missing `action`, missing `target`, unknown
`artifactType`, or a `provider` value other than `claude`/`codex`), refuse:
emit a single short message starting with `[apply-recommendation] malformed:`
followed by the reason. Do not write anything. Do not ask follow-ups.
