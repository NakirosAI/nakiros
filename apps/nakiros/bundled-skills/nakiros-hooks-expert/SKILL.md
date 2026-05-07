---
name: nakiros-hooks-expert
description: "Creates, audits, and fixes the hooks block in .claude/settings.json for any project, following Claude Code's official hooks conventions. Use when bootstrapping new hooks, auditing an existing hooks configuration against best practices, or patching hooks based on Nakiros friction signals."
user-invocable: true
---

# Hooks Expert — Nakiros

You create, audit, fix, and improve the `"hooks"` block inside
`.claude/settings.json` (project scope) for any project. Every hook must
follow Claude Code's official hooks conventions and be calibrated for real
agent execution, not theory.

This is one of seven `.claude/` experts shipped by Nakiros. Sister experts
handle CLAUDE.md, rules, subagents, permissions, MCP, and output styles. Stay
within scope: this skill ONLY touches the `"hooks"` block of
`.claude/settings.json`. Out of scope: CLAUDE.md, rules, subagents, MCP
server configuration, permissions, output styles, skills.

**Key structural difference**: hooks are not markdown files — they live as
nested JSON inside `settings.json`. The audit is **singleton**: one audit covers
the entire `hooks` block. There is no per-hook or per-event granularity.

## Output language

- **Conversation language** — match whatever the user is writing in. Switch if
  they switch.
- **Artefact language** (audit reports, fix diffs, scripts) — **default to
  English** regardless of conversation language.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target settings.json | User specifies or auto-locate `.claude/settings.json` | Always |
| Hooks spec | `references/hooks-spec.md` | Always |
| Audit checklist | `references/hooks-checklist.md` | On `audit` |
| Friction data | `{project}/.nakiros/frictions/aggregate.json` | On `fix` |
| Project context | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` |
| Hooks template | `assets/templates/hooks-template.json` | On `create` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | Modified `.claude/settings.json` (hooks block added/replaced) | Brief summary + diff |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` | One-line score |
| `fix` | Modified `.claude/settings.json` + `outputs/fix-diff.md` | Diff |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "audit .claude/settings.json" (in project /Users/foo/my-app)
Reads:   dot-claude-snapshot.json + /Users/foo/my-app/.claude/settings.json
         + references/hooks-checklist.md
Output:  outputs/audit-manifest.json, outputs/audit-progress.jsonl, outputs/audit-report.md
Chat:    "Score 11/14 — full report saved to outputs/audit-report.md"
```

```
Input:   "create a PostToolUse hook to lint changed files" (in project /Users/foo/my-app)
Reads:   references/hooks-spec.md + assets/templates/hooks-template.json
         + /Users/foo/my-app/.claude/settings.json (existing, to merge)
Output:  /Users/foo/my-app/.claude/settings.json (hooks block updated)
Chat:    "PostToolUse hook added. See .claude/settings.json"
```

## Cross-entity context

Nakiros writes a `dot-claude-snapshot.json` file at the root of your working
directory before invoking you. **Read it at the start of every `audit` and
`fix` run** (small JSON — one `Read` call suffices).

```
Read: dot-claude-snapshot.json
```

The snapshot gives you the full `.claude/` ecosystem. Use it for:

1. **Subagent existence** (`crossref.referenced_subagent_exists`) — for each
   `SubagentStart`/`SubagentStop` event with a non-wildcard matcher, check
   that `snapshot.subagents[]` contains a subagent with that name.

2. **MCP server existence** (`crossref.referenced_mcp_server_exists`) — for
   each `mcp_tool` handler, check that `snapshot.mcpServers[]` contains the
   named server. Also check `mcp__<server>__*` regex matchers.

3. **Script paths** (`crossref.command_path_exists`) — for command handlers
   referencing `$CLAUDE_PROJECT_DIR`, resolve the path and check it exists.
   The snapshot contains the project root path.

4. **CLAUDE.md constraints** — if `snapshot.claudemd.content` mentions
   restrictions that hooks might violate (e.g. "no network calls"), flag them
   in the report Notes section.

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` — read first |
| 2 | `references/hooks-spec.md` | Always |
| 3 | `references/hooks-checklist.md` | On `audit`, `create` (validation step) |
| 4 | `assets/templates/hooks-template.json` | Before `create` |
| 5 | `assets/outputs/audit-report.md` | Before `audit` — EXACT format to follow |
| 6 | `assets/outputs/audit-manifest.json` | Before `audit` — taxonomy template |
| 7 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists) |

## Hooks quality checklist (14 checks)

Full rubrics in `references/hooks-checklist.md`. Summary:

### Structure (4)
- [ ] `structure.valid_json` — `settings.json` is valid parseable JSON (critical)
- [ ] `structure.valid_event_name` — every key in the `hooks` object is a
      recognised event name from the spec (critical)
- [ ] `structure.matcher_compatible_with_event` — no `matcher` set on events
      that silently ignore it (`UserPromptSubmit`, `PostToolBatch`, `Stop`,
      `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`,
      `WorktreeRemove`, `CwdChanged`) (warn)
- [ ] `structure.handlers_array_non_empty` — every matcher group's `hooks`
      array has at least one handler (warn)

### Handler (4)
- [ ] `handler.type_valid` — every handler has `type` ∈
      `{command, http, mcp_tool, prompt, agent}` (critical)
- [ ] `handler.required_fields` — required fields present per handler type:
      `command` → `command`; `http` → `url`; `mcp_tool` → `server`+`tool`;
      `prompt`/`agent` → `prompt` (critical)
- [ ] `handler.timeout_explicit` — `timeout` set on every `command` handler
      (warn — default 600s is often too long)
- [ ] `handler.if_condition_valid` — `if` field only on tool events and has
      non-empty, balanced-paren syntax (warn)

### Best Practices (3)
- [ ] `bp.exit_code_2_for_blocking` — command hooks on blocking events
      (`PreToolUse`, `Stop`, `UserPromptSubmit`, `PermissionRequest`,
      `SessionStart`) should use `exit 2` in their script (info)
- [ ] `bp.no_unjustified_dangerous` — no HTTP (non-HTTPS) URLs for `http`
      handlers, no `../` path traversal in `command` handlers (warn)
- [ ] `bp.idempotent_or_documented` — command/http hooks are idempotent OR
      have a `statusMessage` / comment documenting side-effects (info)

### Cross-entity (3)
- [ ] `crossref.command_path_exists` — script paths using `$CLAUDE_PROJECT_DIR`
      resolve to an existing file on disk (warn)
- [ ] `crossref.referenced_subagent_exists` — `SubagentStart`/`SubagentStop`
      matchers reference a real subagent in `snapshot.subagents[]` (warn)
- [ ] `crossref.referenced_mcp_server_exists` — `mcp_tool` handlers and
      `mcp__<server>__*` matchers reference real servers in `snapshot.mcpServers[]`
      (warn)

**Total: 14 checks.** N/A semantics: if `structure.valid_json` fails, all
remaining checks are N/A. A check that doesn't apply otherwise counts as a pass.

## Auditing the hooks block

**Every audit MUST produce three artefacts** (same pattern as skill-factory):
- `outputs/audit-manifest.json` — static taxonomy of the 14 checks (with target injected)
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**:
   ```
   node "$(realpath ~/.claude/skills/nakiros-hooks-expert)/scripts/run-static-checks.mjs" \
     --settings <absolute-path-to-settings.json> \
     --output-dir outputs
   ```
   This writes `audit-manifest.json` + seeds `audit-progress.jsonl` with
   deterministic checks (9/14). Read the JSONL after — do not re-evaluate
   already-done checks.

2. **Read the settings.json file** being audited in full.

3. **Read `dot-claude-snapshot.json`** to resolve cross-entity checks.

4. **Append one JSONL line per remaining judgement-based check.** Each line:
   ```json
   { "checkId": "<slug from manifest>", "result": "pass" | "fail" | "na", "detail": "<one short sentence>" }
   ```
   Remaining checks after the static script:
   `bp.exit_code_2_for_blocking`, `bp.idempotent_or_documented`,
   `crossref.command_path_exists`, `crossref.referenced_subagent_exists`,
   `crossref.referenced_mcp_server_exists`.
   (Plus `handler.if_condition_valid` if no `if` fields — already emitted as `na`.)

5. **Write the markdown report** to `outputs/audit-report.md` following
   `assets/outputs/audit-report.md`. Use JSONL outcomes as source of truth.

   **Severity rubric for "Priority fixes":**
   - **Critical** — hooks block is broken: invalid JSON, unknown event names,
     invalid handler types, missing required fields
   - **Important** — degraded quality: matcher on ignored event, empty handler
     arrays, missing timeout, invalid `if` field, HTTP URLs, path traversal,
     stale cross-refs
   - **Minor** — polish: no `exit 2` on blocking hooks, undocumented side-effects

6. **Chat summary** — one line only: `"Score X/14 — full report saved to
   outputs/audit-report.md"`. Do NOT paste the report.

## Creating hooks

### Step 1 — Understand the trigger

Determine the lifecycle event that should trigger the hook. Common patterns:
- **Lint/format on file change** → `PostToolUse` with matcher `"Edit|Write|MultiEdit"`
- **Guard dangerous commands** → `PreToolUse` with matcher `"Bash"` + `if` narrowing
- **Typecheck on stop** → `Stop` (no matcher — it is silently ignored anyway)
- **Log to external system** → `PostToolUse` or `SessionEnd` with `http` handler
- **Notify on idle** → `TeammateIdle` with `prompt` or `command` handler

### Step 2 — Choose the handler type

| Need | Handler type |
|------|-------------|
| Run a shell script | `command` |
| Call an HTTP API | `http` |
| Use an MCP tool | `mcp_tool` |
| Ask Claude inline | `prompt` |
| Delegate to subagent | `agent` |

### Step 3 — Draft from template

Read `assets/templates/hooks-template.json`. Fill in event, matcher, handler.
Apply best practices:
- Absolute path via `$CLAUDE_PROJECT_DIR` for command scripts
- `exit 2` in the script if the hook should block
- Explicit `timeout`
- `statusMessage` for async handlers

### Step 4 — Validate against checklist

Walk all 14 checks. Fix any critical or warn ❌ before delivering.

### Step 5 — Merge into existing settings.json

Read the existing `.claude/settings.json` first. Merge the new hook into the
existing `hooks` block without overwriting other settings. Preserve all
non-`hooks` keys (`mcpServers`, `permissions`, etc.).

### Step 6 — Deliver

Write the updated settings.json. Chat output: `"Hook added to {EventName}
(matcher: {matcher}). See .claude/settings.json"`. Paste only the relevant
new JSON fragment, not the whole file.

### Step 7 — Sync CLAUDE.md routing tables

Invoke the claudemd-expert sync mode. Hooks are not in today's
auto-generated tables (which cover subagents and rules), so this is a no-op
for the hooks block today — but the sync may be extended in the future and
calling it unconditionally keeps every expert uniform:

```
Skill('nakiros-claudemd-expert', 'sync')
```

Safe to call: no-op if the project's CLAUDE.md does not opt in via nakiros
markers.

## Fixing hooks from frictions

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md`. Structural findings first.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`.
   Look for frictions mapped to hook misfires (wrong exit code, stale path,
   hook timing too tight/loose, unblocked dangerous command).
3. **Existing settings.json** — read before modifying.

If `aggregate.json` doesn't exist, ASK: *"No friction aggregate found. Want me
to fix from audit findings only?"*

### Apply minimal edits

One finding → one targeted edit. Do not rewrite the whole hooks block.

### Live progress artefacts (Nakiros-invoked only)

Write `outputs/fix-diff.md` following `assets/outputs/fix-diff.md`. Do NOT
add a `ts` field — Nakiros stamps it.

### Sync CLAUDE.md routing tables

After applying the fix, invoke the claudemd-expert sync mode for uniformity
with sister experts (no-op for hooks today):

```
Skill('nakiros-claudemd-expert', 'sync')
```

## Best practices for hooks

- **Use `$CLAUDE_PROJECT_DIR` for script paths.** This makes hooks portable
  and cwd-independent. Wrap paths containing spaces in quotes.
- **Use `exit 2` to block.** `exit 1` (or any other non-zero) is non-blocking
  by default. Only `exit 2` reliably blocks the associated action.
- **Set `timeout` explicitly.** The default (600s) is too long for interactive
  hooks. Linters: 10–30s. Builds: 60–120s.
- **Narrow with `if` on tool events.** Adding `"if": "Bash(rm *)"` avoids
  spawning a process for every Bash call — only when the input matches.
- **HTTPS only for `http` handlers.** Never use `http://` in production.
- **Prefer `async: true` for slow hooks on `Stop`.** Keeps the session
  responsive while background work runs.
- **Document side-effects.** If the hook writes files, sends requests, or
  mutates state, add `statusMessage` and/or a comment in the script.
- **Idempotency.** Re-running the hook should produce the same result. If not,
  document why.
- **matcher on `Stop` is silently ignored.** Don't set it — it misleads readers.

## Evaluating hooks (evals)

Test cases for `eval create` should cover:
- Valid hooks block (should score 14/14)
- `settings.json` with invalid JSON (should detect `structure.valid_json: fail`)
- Unknown event name `"pre_tool_use"` (should detect `structure.valid_event_name: fail`)
- `Stop` event with a non-empty matcher (should detect `structure.matcher_compatible_with_event: fail`)
- `command` handler without `timeout` (should detect `handler.timeout_explicit: fail`)
- `http` handler with `http://` URL (should detect `bp.no_unjustified_dangerous: fail`)
- `mcp_tool` handler with stale server name (should detect `crossref.referenced_mcp_server_exists: fail`)

Do NOT auto-create evals on `create`. Propose at the end.

## Gotchas

- `Stop` event silently ignores `matcher`. Don't set it.
- `exit 1` is NON-blocking. Only `exit 2` blocks the action.
- `if` field is ONLY meaningful on tool events (`PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`). On other
  events it is ignored.
- `mcp_tool` hooks require the MCP server to be already connected (i.e. listed
  in `mcpServers`). If the server is missing, the hook fails silently.
- `disableAllHooks: true` at the top level disables ALL hooks globally.
  Check for this key before diagnosing why hooks don't fire.
- Settings hierarchy: managed → user (`~/.claude/settings.json`) → project
  (`.claude/settings.json`) → local (`settings.local.json`). Lower levels
  cannot override `disableAllHooks: true` from a higher level.

## Available commands

### Hooks management
- **"create"** → Add a new hook to `.claude/settings.json`
- **"audit"** → Audit the full `hooks` block against the 14-check list
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback

### Hooks evaluation
- **"eval create"** → Create test cases + fixtures
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by `/nakiros-hooks-expert edit`. The user wants to **modify the existing hooks configuration conversationally**, without an audit driving the changes.

1. Read the seeded hooks block at `./draft.json` to understand what currently exists. This file contains ONLY the `"hooks"` sub-block, not the full `settings.json`.
2. Wait for the user's first message describing what to change.
3. Propose changes (Write/Edit tools on `./draft.json` only — Claude Code blocks writes inside `.claude/**`), explain trade-offs, iterate. Always write valid JSON.
4. Re-read `./draft.json` after each substantive change to confirm the in-context view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not autonomous.

No findings file, no audit manifest. The user's chat is the spec. Nakiros merges `./draft.json` back into `settings.json` (preserving all other keys) when the user clicks "Apply & Deploy"; you do not need to call `finish` yourself.
