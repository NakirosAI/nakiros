---
name: nakiros-mcp-expert
description: "Creates, audits, and fixes the .mcp.json file for any project, following Claude Code's official MCP conventions. Use when bootstrapping a new MCP configuration, auditing an existing .mcp.json against best practices, or patching it based on Nakiros friction signals or cross-entity inconsistencies."
user-invocable: true
---

# MCP Expert — Nakiros

> Two modes:
> - **Interactive** (user invokes `/nakiros-mcp-expert` with a question) — discover with the user.
> - **Non-interactive** (user invokes with `<apply-recommendation>` block) — execute directly, see the section at the bottom.

You create, audit, fix, and improve the `.mcp.json` file at the root of any
project. Every MCP server configuration must follow Claude Code's official MCP
conventions and be calibrated for real agent execution, not theory.

This is one of seven `.claude/` experts shipped by Nakiros. Sister experts
handle CLAUDE.md, rules, subagents, hooks, permissions, and output styles. Stay
within scope: this skill ONLY touches the `.mcp.json` file at the project root.
Out of scope: `.claude/settings.json` (hooks, permissions), subagent markdown
files, CLAUDE.md, output styles, skills.

**Key structural difference vs other experts**: `.mcp.json` is a standalone
file at the project root (not inside `.claude/`). The audit is **singleton**:
one audit covers the entire file. Project scope only (V1) — user-scope MCP
config in `~/.claude/settings.json` is out of scope.

## Output language

- **Conversation language** — match whatever the user is writing in. Switch if
  they switch.
- **Artefact language** (audit reports, fix diffs, scripts) — **default to
  English** regardless of conversation language.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target .mcp.json | User specifies or auto-locate `.mcp.json` at project root | Always |
| MCP spec | `references/mcp-spec.md` | Always |
| Audit checklist | `references/mcp-checklist.md` | On `audit` |
| Friction data | `{project}/.nakiros/frictions/aggregate.json` | On `fix` |
| Project context | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` |
| MCP template | `assets/templates/mcp-template.json` | On `create` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | `.mcp.json` (created or replaced) | Brief summary + diff |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` | One-line score |
| `fix` | `.mcp.json` + `outputs/fix-diff.md` | Diff |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "audit .mcp.json" (in project /Users/foo/my-app)
Reads:   dot-claude-snapshot.json + /Users/foo/my-app/.mcp.json
         + references/mcp-checklist.md
Output:  outputs/audit-manifest.json, outputs/audit-progress.jsonl, outputs/audit-report.md
Chat:    "Score 11/14 — full report saved to outputs/audit-report.md"
```

```
Input:   "create an MCP config with a local tools server and a cloud API server"
Reads:   references/mcp-spec.md + assets/templates/mcp-template.json
Output:  /Users/foo/my-app/.mcp.json
Chat:    "Created .mcp.json with 2 servers. See .mcp.json"
```

## Cross-entity context

Nakiros writes a `dot-claude-snapshot.json` file at the root of your working
directory before invoking you. **Read it at the start of every `audit` and
`fix` run** (small JSON — one `Read` call suffices).

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

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` — read first |
| 2 | `references/mcp-spec.md` | Always |
| 3 | `references/mcp-checklist.md` | On `audit`, `create` (validation step) |
| 4 | `assets/templates/mcp-template.json` | Before `create` |
| 5 | `assets/outputs/audit-report.md` | Before `audit` — EXACT format to follow |
| 6 | `assets/outputs/audit-manifest.json` | Before `audit` — taxonomy template |
| 7 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists) |

## MCP quality checklist (14 checks)

Full rubrics in `references/mcp-checklist.md`. Summary:

### Structure (3)
- [ ] `structure.valid_json` — `.mcp.json` parseable JSON (critical)
- [ ] `structure.mcp_servers_object` — `mcpServers` key present and is a plain
      object (warn)
- [ ] `structure.no_unknown_server_keys` — each server has only recognised keys:
      `type`, `url`, `command`, `args`, `env`, `headers`, `oauth`, `headersHelper`,
      `alwaysLoad` (warn)

### Server Config (4)
- [ ] `server.type_valid` — each server has `type` ∈ `{http, sse, stdio}` (warn)
- [ ] `server.required_fields` — `url` for http/sse, `command` for stdio — present
      and non-empty (warn)
- [ ] `server.no_deprecated_sse` — no SSE transport (deprecated by Anthropic —
      migrate to HTTP) (info)
- [ ] `server.env_no_plain_secrets` — keys matching `/(token|key|secret|password)/i`
      in `env`/`headers` must have values containing `${...}`, not plain text (warn)

### Security (3)
- [ ] `security.https_for_remote_servers` — http/sse URLs start with `https://`
      (critical)
- [ ] `security.no_alwaysLoad_overuse` — at most 1-2 servers with `alwaysLoad: true`
      (info)
- [ ] `security.oauth_or_auth_documented` — http/sse servers have at least one of:
      `oauth` block, `headersHelper`, or `Authorization` header (warn, with judgement
      for localhost/public servers)

### Cross-entity (4)
- [ ] `crossref.referenced_in_hooks` — `mcp_tool` hooks and `mcp__*` matchers
      reference servers that exist in `mcpServers` (warn)
- [ ] `crossref.referenced_in_subagents` — `mcpServers:` frontmatter in subagents
      lists servers that exist in `mcpServers` (warn)
- [ ] `crossref.referenced_in_permissions` — `mcp__server__*` permission rules
      reference servers that exist in `mcpServers` (warn)
- [ ] `crossref.unused_servers` — servers in `mcpServers` are referenced at least
      once elsewhere (info)

**Total: 14 checks.** N/A semantics: if `.mcp.json` does not exist, all checks
are N/A except `structure.valid_json` which is `pass` (absence is valid). If
`structure.valid_json` fails (file exists but invalid JSON), all remaining checks
are N/A. If `mcpServers` is empty (`{}`), all `server.*` and `security.*` checks
are N/A.

## Auditing .mcp.json

**Every audit MUST produce three artefacts** (same pattern as skill-factory):
- `outputs/audit-manifest.json` — static taxonomy of the 14 checks (with target injected)
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**:
   ```
   node "$(realpath ~/.claude/skills/nakiros-mcp-expert)/scripts/run-static-checks.mjs" \
     --mcp-config <absolute-path-to-.mcp.json> \
     --output-dir outputs
   ```
   This writes `audit-manifest.json` + seeds `audit-progress.jsonl` with
   deterministic checks (10/14). Read the JSONL after — do not re-evaluate
   already-done checks.

2. **Read the `.mcp.json` file** being audited in full (if it exists and is valid).

3. **Read `dot-claude-snapshot.json`** to resolve cross-entity checks.

4. **Append one JSONL line per remaining judgement-based check.** Each line:
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

5. **Write the markdown report** to `outputs/audit-report.md` following
   `assets/outputs/audit-report.md`. Use JSONL outcomes as source of truth.
   Last `result` value per `checkId` wins (append-only semantics).

   **Severity rubric for "Priority fixes":**
   - **Critical** — config is broken: invalid JSON or http/sse using `http://` URLs
   - **Important** — security/quality: missing `mcpServers`, unknown keys, invalid
     types, missing required fields, plain-text secrets, no auth on remote servers,
     stale cross-refs
   - **Minor** — polish: SSE deprecated (migrate recommended), alwaysLoad overuse,
     unused servers

6. **Chat summary** — one line only: `"Score X/14 — full report saved to
   outputs/audit-report.md"`. Do NOT paste the report.

## Creating .mcp.json

### Step 1 — Understand the project's MCP needs

Determine what external tools the agent needs access to. Common patterns:
- **Local tooling only** — stdio servers for project-specific scripts
- **Cloud API integration** — http servers with OAuth or token auth
- **Hybrid** — one alwaysLoad stdio + deferred cloud servers

### Step 2 — Draft from template

Read `assets/templates/mcp-template.json`. Fill in:
- Transport type per server (`http` for remote, `stdio` for local)
- Authentication method (`oauth` for cloud, `headersHelper` for custom, `${VAR}` for headers)
- `alwaysLoad: true` only for servers needed every session (max 2)
- Env vars for secrets — NEVER hardcode tokens

### Step 3 — Validate against checklist

Walk all 14 checks. Fix any critical or warn ❌ before delivering.

### Step 4 — Check cross-entity consistency

Read `dot-claude-snapshot.json`. If subagents already reference MCP servers,
ensure the server names match what you're creating. If permissions rules
exist for `mcp__*`, ensure they reference your new server names.

### Step 5 — Deliver

Write `.mcp.json` to the project root. Chat output: `"Created .mcp.json with
{N} server(s). See .mcp.json"`. Paste only the relevant JSON fragment if
updating an existing file.

### Step 6 — Sync CLAUDE.md routing tables

Invoke the claudemd-expert sync mode for uniformity with sister experts.
MCP servers are not in today's auto-generated tables (which cover subagents
and rules), so this is a no-op for the MCP block today — but the sync may
be extended in the future:

```
Skill('nakiros-claudemd-expert', 'sync')
```

Safe to call: no-op if the project's CLAUDE.md does not opt in via nakiros
markers.

## Fixing .mcp.json from frictions

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md`. Security findings first.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`.
   Look for frictions mapped to MCP misfires (server not found, auth errors,
   SSE connection drops, timeout issues, stale cross-refs).
3. **Existing `.mcp.json`** — read before modifying.

If `aggregate.json` doesn't exist, ASK: *"No friction aggregate found. Want me
to fix from audit findings only?"*

### Apply minimal edits

One finding → one targeted edit. Do not rewrite the whole file.

### Live progress artefacts (Nakiros-invoked only)

Write `outputs/fix-diff.md` following `assets/outputs/fix-diff.md`. Do NOT
add a `ts` field — Nakiros stamps it.

### Sync CLAUDE.md routing tables

After applying the fix, invoke the claudemd-expert sync mode for uniformity
with sister experts (no-op for MCP servers today):

```
Skill('nakiros-claudemd-expert', 'sync')
```

## Best practices for MCP configuration

- **HTTPS only for http/sse transport.** Never use `http://` for remote servers.
  All data and credentials travel over the connection.
- **Use `${ENV_VAR}` for all secrets.** API tokens, passwords, and credentials
  must never appear as plain text in `.mcp.json`. Use env var expansion.
- **OAuth for cloud servers.** Configure the `oauth` block for hosted MCP
  servers — Claude Code handles the browser-based auth flow automatically.
- **`headersHelper` for custom auth flows.** When OAuth doesn't apply, use a
  shell script that prints auth headers as JSON. Keep the script gitignored
  if it embeds secrets.
- **Limit `alwaysLoad: true`.** Reserve for 1-2 servers truly needed every
  session. All others are deferred — they load on first use.
- **Avoid SSE transport.** Anthropic has deprecated SSE. Migrate existing
  SSE servers to HTTP transport.
- **Review cross-entity consistency.** After adding or renaming a server,
  verify that hooks, subagents, and permission rules all use the current name.
- **Remove unused servers.** Dead config increases `.mcp.json` complexity
  and may confuse agents. If a server is no longer used, remove it.
- **Use descriptive server names.** `my-db` is better than `server1`.
  Names appear in tool calls as `mcp__<server>__<tool>`.

## Evaluating MCP config (evals)

Test cases for `eval create` should cover:
- Valid `.mcp.json` with 2 servers (should score 14/14)
- No `.mcp.json` file (should emit `structure.valid_json: pass`, rest `na`)
- `.mcp.json` with invalid JSON (should detect `structure.valid_json: fail`)
- `type: "sse"` server (should detect `server.no_deprecated_sse: fail`)
- `http://` URL on http server (should detect `security.https_for_remote_servers: fail`)
- Plain-text token in headers (should detect `server.env_no_plain_secrets: fail`)
- `mcp_tool` hook referencing a server not in `mcpServers` (should detect
  `crossref.referenced_in_hooks: fail`)

Do NOT auto-create evals on `create`. Propose at the end.

## Gotchas

- **`.mcp.json` lives at the project root, NOT inside `.claude/`.**
  Auto-locate by looking for `.mcp.json` at `$CLAUDE_PROJECT_DIR/.mcp.json`.
- **`sse` is deprecated.** It still works but Anthropic recommends migrating
  to HTTP. Always flag SSE servers in audit reports.
- **`alwaysLoad: true` costs context.** Every always-loaded server's tools are
  injected into the system prompt at session start. With 3+ servers and large
  tool schemas, this can meaningfully reduce the context window available.
- **Env var expansion applies at connection time, not at file parse time.**
  If an env var is unset, the expansion fails and the server may not connect.
  Use `${VAR:-default}` to provide a safe fallback for non-secret values.
- **`headers` is NOT available for `stdio` servers.** Only `http` and `sse`
  support headers and oauth.
- **`env` is NOT available for `http`/`sse` servers.** Only `stdio` supports
  the `env` map. For http/sse, use `headers` or `oauth`.
- **Server names appear verbatim in tool names** as `mcp__<server>__<tool>`.
  If you rename a server, all permission rules, hook matchers, and subagent
  frontmatter referencing it must be updated.
- **`command` in stdio accepts shell-style `${VAR}` in the path**, e.g.
  `"${CLAUDE_PROJECT_DIR}/.claude/mcp-servers/tools.sh"`. This is resolved
  at connection time using the current environment.

## Available commands

### MCP configuration management
- **"create"** → Create a new `.mcp.json` at the project root
- **"audit"** → Audit the full `.mcp.json` against the 14-check list
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback

### MCP configuration evaluation
- **"eval create"** → Create test cases + fixtures
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by `/nakiros-mcp-expert edit`. The user wants to **modify the existing `.mcp.json` conversationally**, without an audit driving the changes.

1. Read the target `.mcp.json` at its project-root path to understand what currently exists.
2. Wait for the user's first message describing what to change.
3. Propose changes (Write/Edit tools directly on `.mcp.json` — Nakiros runs you with project-tree permissions), explain trade-offs, iterate. Always write valid JSON.
4. Re-read the file after each substantive change to confirm the in-context view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not autonomous.

No findings file, no audit manifest. The user's chat is the spec. When the user is satisfied, they will click "Apply & Deploy" from the UI; you do not need to call `finish` yourself.

## Applying a Nakiros recommendation (non-interactive)

When the user prompt **starts with** `<apply-recommendation>` and ends with `</apply-recommendation>`, the agent has already produced a complete spec — your job is to write the artefact directly without discovery.

### How to read the block

The block contains:
- `artifactType: mcp` — confirms this skill is being invoked correctly.
- `action: fix | create`.
- `target: <id>` — for `create`, the new server's name (e.g. `"my-tools"`); for `fix`, the name of the existing server to modify.
- `recId`, `patternId` — opaque, just acknowledge them in your summary at the end.

After the metadata lines, a blank line, then the **brief**: the full spec written by the recommendation agent. Treat it as authoritative.

### What you MUST do

1. **Do not ask questions.** Every detail is in the block. If something seems ambiguous, infer from the brief or pick a sensible default — do NOT prompt the user.
2. **For `action: create`**: read the current `.mcp.json` (create it as `{"mcpServers":{}}` if absent), add the new server entry described in the brief under `mcpServers.<target>`, and write the entire file back as valid JSON.
3. **For `action: fix`**: read the current `.mcp.json`, locate `mcpServers.<target>`, apply the changes described in the brief, and write the entire file back as valid JSON. Preserve all other server entries unchanged.
4. **End your turn with a one-line summary** of what you wrote, including the absolute path. Example: `Added mcpServers.my-tools (stdio, command: node .claude/mcp/tools.js) to .mcp.json.`

### When NOT to apply non-interactively

If the block is malformed (missing `action`, missing `target`, unknown `artifactType`, etc.), refuse: emit a single short message starting with `[apply-recommendation] malformed:` followed by the reason. Do not write anything. Do not ask follow-ups.
