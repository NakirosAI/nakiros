# Hooks Audit Checklist — 14 Checks

Full rubrics for each check in `audit-manifest.json`. Severity levels:
**Critical** (C), **Warn** (W), **Info** (I).

---

## Section: Structure (4 checks)

### `structure.valid_json` — C

**Goal**: Ensure `settings.json` is parseable JSON.

**Pass**: `JSON.parse()` succeeds.
**Fail**: File missing, unreadable, or invalid JSON.
**N/A**: Never N/A (the check itself is the entry point).

**Rubric**: If this fails, emit `na` for all remaining checks — nothing can be
evaluated on a broken file.

---

### `structure.valid_event_name` — C

**Goal**: Each key in the `hooks` object must be a recognised hook event name.

**Pass**: All event keys are in the known set from the spec.
**Fail**: At least one key is unknown or misspelled (e.g. `"pre_tool_use"` instead
  of `"PreToolUse"`).
**N/A**: If `structure.valid_json` failed.

**Known events**: See `hooks-spec.md § Hook events`.

**Detail format**: `"Unknown hook event(s): FooBar, pre_tool_use"`

---

### `structure.matcher_compatible_with_event` — W

**Goal**: Some events silently ignore the `matcher` field. Setting a matcher on
  them is misleading and likely a mistake.

**Pass**: No matcher set on `UserPromptSubmit`, `PostToolBatch`, `Stop`,
  `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`,
  `WorktreeRemove`, `CwdChanged`.
**Fail**: At least one matcher group on these events has a non-empty `matcher`.
**N/A**: If `structure.valid_json` failed.

**Detail format**: `"Matcher set on events that ignore it: Stop[matcher="build"], UserPromptSubmit[matcher="*"]"`

**Note**: An absent or `null` matcher is fine — only a non-empty string triggers a fail.

---

### `structure.handlers_array_non_empty` — W

**Goal**: Every matcher group must have at least one handler. An empty `hooks: []`
  inside a matcher group is a dead entry that does nothing.

**Pass**: Every `{ matcher, hooks }` object has `hooks.length >= 1`.
**Fail**: At least one matcher group has `hooks: []` or `hooks` missing.
**N/A**: If `structure.valid_json` failed.

**Detail format**: `"Matcher groups with empty handlers array: PostToolUse["Edit"], PreToolUse[#2]"`

---

## Section: Handler (4 checks)

### `handler.type_valid` — C

**Goal**: Every handler object must have a `type` field that is one of the five
  valid types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

**Pass**: All handlers have a valid type.
**Fail**: At least one handler has a missing, null, or unknown type.
**N/A**: If `structure.valid_json` failed.

**Detail format**: `"Invalid handler type(s): PostToolUse/Edit[0]: type=\"shell\""`

---

### `handler.required_fields` — C

**Goal**: Each handler must include the fields required for its type.

| Type | Required fields |
|------|----------------|
| `command` | `command` |
| `http` | `url` |
| `mcp_tool` | `server`, `tool` |
| `prompt` | `prompt` |
| `agent` | `prompt` |

**Pass**: All handlers have all required fields for their type.
**Fail**: At least one required field is missing or empty.
**N/A**: If `structure.valid_json` failed or `handler.type_valid` failed for this handler.

**Detail format**: `"Missing required fields: PreToolUse/Bash[1] type=mcp_tool: missing \"server\""`

---

### `handler.timeout_explicit` — W

**Goal**: Command handlers should have an explicit `timeout` to avoid long-running
  hooks blocking the session unexpectedly. The default (600s) is often too long
  for interactive linters or formatters.

**Pass**: Every `type: "command"` handler has a `timeout` field set to a non-null value.
**Fail**: At least one `type: "command"` handler lacks `timeout`.
**N/A**: No `command` handlers present.

**Detail format**: `"3 command hook(s) without explicit timeout: PostToolUse/Edit[0], Stop/*[0], Stop/*[1]"`

---

### `handler.if_condition_valid` — W

**Goal**: The `if` field is only meaningful on tool events and must contain valid
  permission-rule syntax (a non-empty string with balanced parentheses).

**Pass**: All `if` fields are on supported events (`PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`) and have
  syntactically valid values.
**Fail**: `if` present on a non-tool event, or value is empty/has unbalanced
  parentheses.
**N/A**: No `if` fields present.

**Detail format**: `"Stop/*[0]: \"if\" field not supported on Stop"`

---

## Section: Best Practices (3 checks)

### `bp.exit_code_2_for_blocking` — I

**Goal**: Blocking command hooks (those on events where exit 2 blocks the action:
  `PreToolUse`, `Stop`, `UserPromptSubmit`, `PermissionRequest`, `SessionStart`)
  should use `exit 2` in their script to signal a blocking error. `exit 1` is
  non-blocking and may not produce the intended behaviour.

**How to evaluate**: For command hooks on blocking events, attempt to `Read` the
  script file. If the script exists and contains `exit 2`, pass. If it does not
  contain `exit 2`, emit a fail with a note that it may not block as intended.

**Pass**: All command hooks on blocking events reference scripts that contain `exit 2`,
  OR the hook's intent is clearly non-blocking (async=true, statusMessage implies
  background work).
**Fail**: A command hook on a blocking event does NOT contain `exit 2`.
**N/A**: No command hooks on blocking events.

**Note**: This is Info severity — it is a guidance check, not a hard error. A hook
  using `exit 1` may be intentionally non-blocking.

---

### `bp.no_unjustified_dangerous` — W

**Goal**: Detect obviously dangerous patterns that could silently compromise security.

**Deterministic sub-checks (handled by the static script)**:
- `http` handlers with non-HTTPS URLs (`http://`)
- `command` handlers with path traversal (`../`)

**Judgement sub-checks (agent evaluates)**:
- Command strings that look like they bypass Claude Code safety (e.g. `--dangerously-skip-permissions`)
- Commands that pipe untrusted input to `sh -c` or `eval`
- Wildcard deletions like `rm -rf *`

**Pass**: No obviously dangerous patterns.
**Fail**: At least one dangerous pattern found (detail lists each offender).
**N/A**: Never N/A once structure checks pass.

---

### `bp.idempotent_or_documented` — I

**Goal**: Hooks that write state, send requests, or mutate files should either be
  idempotent (re-running produces the same result) or have a nearby comment /
  `statusMessage` that describes the side-effect.

**How to evaluate**: For each command hook, check whether:
1. `statusMessage` is present and describes the action, OR
2. The command is clearly read-only / idempotent (e.g. `tsc --noEmit`, a linter), OR
3. The script itself (if `Read`able) has a comment near the mutation.

**Pass**: All hooks meet one of the above criteria.
**Fail**: At least one hook mutates state without any documentation.
**N/A**: No command or http handlers present.

---

## Section: Cross-entity (3 checks)

### `crossref.command_path_exists` — W

**Goal**: Command hooks that reference a script via `$CLAUDE_PROJECT_DIR` should
  point to a real file. A stale path means the hook silently fails to run.

**How to evaluate**: For each `command` handler:
1. Check if the command contains `$CLAUDE_PROJECT_DIR` or a `.claude/` relative path.
2. If yes, resolve the path (replace `$CLAUDE_PROJECT_DIR` with the project root).
3. Attempt a `Read` or use `Bash` to check `test -f <path>`.

**Pass**: All referenced script paths exist on disk.
**Fail**: At least one script path does not exist.
**N/A**: No command handlers reference `$CLAUDE_PROJECT_DIR` paths.

**Detail format**: `"Script not found: $CLAUDE_PROJECT_DIR/.claude/hooks/lint.sh"`

---

### `crossref.referenced_subagent_exists` — W

**Goal**: Hooks on `SubagentStart`/`SubagentStop` events whose matcher names a
  specific agent should correspond to a real subagent in the project.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.subagents[]`. For
  each `SubagentStart`/`SubagentStop` event that has a non-wildcard matcher, check
  that the matcher value matches a subagent name in the snapshot.

**Pass**: All non-wildcard `SubagentStart`/`SubagentStop` matchers resolve to a known subagent.
**Fail**: At least one matcher doesn't match any known subagent.
**N/A**: No `SubagentStart`/`SubagentStop` hooks present, or all matchers are wildcards.

---

### `crossref.referenced_mcp_server_exists` — W

**Goal**: `mcp_tool` handlers and `Elicitation`/`ElicitationResult` matchers that
  reference an MCP server name should correspond to a real MCP server configured
  in the project.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.mcpServers[]`. For
  each `mcp_tool` handler (field `server`) and `mcp__<server>__*` matcher patterns,
  check that the server name exists in the snapshot.

**Pass**: All referenced MCP server names exist in the snapshot.
**Fail**: At least one server name doesn't match any server in the snapshot.
**N/A**: No `mcp_tool` handlers or MCP-pattern matchers present.

---

## Scoring

Total: **14 checks**. Score = number of `pass` results (N/A counts as pass).

| Score | Grade |
|-------|-------|
| 14/14 | Excellent — hooks bloc is correct and follows best practices |
| 12–13/14 | Good — minor issues only |
| 10–11/14 | Needs work — several warn-level findings |
| < 10/14 | Critical issues require immediate fix |
