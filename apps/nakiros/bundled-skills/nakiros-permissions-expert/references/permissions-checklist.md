# Permissions Audit Checklist — 14 Checks

Full rubrics for each check in `audit-manifest.json`. Severity levels:
**Critical** (C), **Warn** (W), **Info** (I).

---

## Section: Structure (3 checks)

### `structure.valid_json` — C

**Goal**: Ensure `settings.json` is parseable JSON.

**Pass**: `JSON.parse()` succeeds.
**Fail**: File missing, unreadable, or invalid JSON.
**N/A**: Never N/A (the check itself is the entry point).

**Rubric**: If this fails, emit `na` for all remaining checks — nothing can be
evaluated on a broken file.

---

### `structure.permissions_keys_known` — W

**Goal**: The `permissions` block should only contain known keys. Unknown keys
are silently ignored by Claude Code but indicate a configuration mistake.

**Known keys**: `allow`, `ask`, `deny`, `defaultMode`, `additionalDirectories`,
`disableBypassPermissionsMode`, `disableAutoMode`.

**Pass**: All keys in the `permissions` object are in the known set.
**Fail**: At least one unknown key present.
**N/A**: No `permissions` block in settings.json.

**Detail format**: `"Unknown permissions key(s): allowAll, skipPrompts"`

---

### `structure.rule_format` — W

**Goal**: Every rule string in `allow`, `ask`, `deny` should start with an
uppercase letter (a tool name) and optionally have a specifier in parentheses.
A rule that doesn't match the expected format is likely a typo or malformed.

**Format regex**: `^[A-Z][A-Za-z]+(\(.+\))?$`

**Pass**: All rule strings in allow/ask/deny match the regex.
**Fail**: At least one rule string does not match.
**N/A**: No rules present in any of allow/ask/deny.

**Detail format**: `"Invalid rule format in deny: \"bash(rm -rf *)\" (starts lowercase), \"Edit()\" (empty specifier)"`

**Note**: The regex allows any specifier content — `Bash(rm -rf *)` is valid
format even if the specifier content itself has issues.

---

## Section: Rule Syntax (4 checks)

### `syntax.allow_rules_valid` — W

**Goal**: Each rule in the `allow` array should be syntactically valid: a
recognized tool name or prefix, and if a specifier is present, balanced
parentheses and non-empty content.

**Pass**: All rules in `allow` parse without error.
**Fail**: At least one rule has unbalanced parentheses or empty specifier.
**N/A**: `allow` is absent or empty.

**Checks performed**:
1. Parentheses are balanced
2. Specifier is non-empty if parentheses are present
3. Tool name starts with uppercase letter

**Detail format**: `"allow rule syntax error: \"Bash(npm run *\" (unbalanced parentheses), \"Edit()\" (empty specifier)"`

---

### `syntax.ask_rules_valid` — W

**Goal**: Same as `syntax.allow_rules_valid` but for the `ask` array.

**Pass**: All rules in `ask` parse without error.
**Fail**: At least one rule has a syntax error.
**N/A**: `ask` is absent or empty.

---

### `syntax.deny_rules_valid` — W

**Goal**: Same as `syntax.allow_rules_valid` but for the `deny` array.

**Pass**: All rules in `deny` parse without error.
**Fail**: At least one rule has a syntax error.
**N/A**: `deny` is absent or empty.

---

### `syntax.default_mode_valid` — W

**Goal**: If `defaultMode` is set, it must be one of the six recognised
permission modes.

**Valid values**: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`,
`bypassPermissions`

**Pass**: `defaultMode` is absent (uses `default` implicitly) or is one of
the six valid values.
**Fail**: `defaultMode` is set to an unrecognised value.
**N/A**: No `permissions` block in settings.json.

**Detail format**: `"defaultMode \"autoApprove\" is not a recognised permission mode"`

---

## Section: Security (4 checks)

### `security.default_mode_not_bypass` — C

**Goal**: `bypassPermissions` disables ALL permission prompts including
last-resort circuit breakers (root/home directory deletion). This mode must
never be used in production settings.

**Pass**: `defaultMode` is absent or is any value other than `bypassPermissions`.
**Fail**: `defaultMode` is `"bypassPermissions"`.
**N/A**: No `permissions` block (implicitly safe — defaults to `default` mode).

**Detail format**: `"defaultMode is bypassPermissions — ALL permission prompts are disabled, including safety circuit breakers"`

---

### `security.dangerous_bash_denied` — I

**Goal**: Explicitly denying dangerous Bash patterns reduces the blast radius
of accidental or adversarial agent actions. This is a **recommendation** (info
severity) — projects with tight `defaultMode` or no-Bash policy may skip this.

**Recommended patterns** (at least ONE should be present in `deny`):
- `Bash(rm -rf *)`
- `Bash(curl *)`
- `Bash(wget *)`
- `Bash(sudo *)`

**Pass**: At least one of the four recommended patterns is present in `deny`.
**Fail**: None of the recommended patterns are present in `deny`.
**N/A**: No `permissions` block, or `defaultMode` is `dontAsk` (deny-all already effective).

**Detail format**: `"No dangerous Bash patterns in deny. Recommended: Bash(rm -rf *), Bash(curl *), Bash(wget *), Bash(sudo *)"`

**On pass**: list which patterns are present and which are missing, e.g.:
`"Found in deny: Bash(rm -rf *). Missing (recommended): Bash(curl *), Bash(wget *)"`

---

### `security.dotclaude_writes_denied` — W

**Goal**: Claude Code blocks all writes to `.claude/**` by default (hard rule).
An explicit `allow` rule for `.claude/**` writes would contradict this
protection and should be flagged.

**How to evaluate**: Scan the `allow` list for rules that would grant write
access to `.claude/**`:
- `Edit(./.claude/**)`, `Write(./.claude/**)`, `Edit(.claude/**)`, etc.
- Generic `Edit` or `Write` without specifier (grants all writes — flag as warn)

**Pass**: No allow rules would grant write access to `.claude/**`.
**Fail**: At least one allow rule explicitly grants write access to `.claude/**`
or grants unrestricted `Edit`/`Write` without specifier.
**N/A**: No `permissions` block.

**Note**: This is a warn, not critical, because Claude Code's built-in rule
still takes precedence. But explicit allow rules for `.claude/` are confusing
and should be removed.

---

### `security.env_files_denied` — W

**Goal**: `.env*` files typically contain secrets (API keys, database
passwords). Deny rules for reading or editing these files prevent the agent
from accidentally leaking them via tool output or modifying them.

**Pass**: The `deny` list contains at least one of:
- `Read(./.env*)` or `Read(.env*)` or equivalent
- `Edit(./.env*)` or `Edit(.env*)` or equivalent

**Fail**: Neither read nor write protection for `.env*` files is in `deny`.
**N/A**: No `permissions` block.

**Detail format**: `"No .env protection in deny. Recommended: add Read(./.env*) and Edit(./.env*) to deny"`

---

## Section: Cross-entity (3 checks)

### `crossref.agent_rules_match_subagents` — W

**Goal**: Rules of the form `Agent(X)` grant or restrict permissions for a
specific subagent. If `X` doesn't match any subagent in the project, the rule
has no effect and is likely stale or a typo.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.subagents[]`.
For each `Agent(X)` rule in allow/ask/deny, check that `X` matches a subagent
name in the snapshot.

**Pass**: All `Agent(X)` rules reference a known subagent.
**Fail**: At least one `Agent(X)` rule doesn't match any subagent.
**N/A**: No `Agent(X)` rules in allow/ask/deny.

**Detail format**: `"Agent(ghost-agent) in deny: no matching subagent in snapshot"`

---

### `crossref.mcp_rules_match_servers` — W

**Goal**: Rules of the form `mcp__<server>` or `mcp__<server>__*` or
`mcp__<server>__<tool>` grant or restrict permissions for an MCP server or
specific tool. If the server doesn't exist in the project's MCP configuration,
the rule is stale.

**How to evaluate**: Read `dot-claude-snapshot.json` → `snapshot.mcpServers[]`.
For each MCP-pattern rule (starts with `mcp__`), extract the server name and
check it against the snapshot.

**Pass**: All `mcp__<server>` rules reference a known MCP server.
**Fail**: At least one MCP rule references a server not in the snapshot.
**N/A**: No MCP-pattern rules in allow/ask/deny.

**Detail format**: `"mcp__legacy-server in deny: no matching MCP server in snapshot"`

---

### `crossref.no_useless_deny_for_undefined_tools` — I

**Goal**: Deny rules for tools, MCP servers, or subagents that don't exist in
the project are dead weight. They signal stale configuration and clutter the
permissions block, making it harder to reason about.

**How to evaluate**: For each rule in `deny`:
1. If it matches `Agent(X)` — check subagent X exists in snapshot.
2. If it starts with `mcp__` — check server exists in snapshot.
3. If it references a non-standard tool name (not `Bash`, `Read`, `Edit`,
   `Write`, `WebFetch`, `mcp__*`, `Agent(*)`) — flag as potentially undefined.

**Pass**: All deny rules reference tools/servers/subagents that are actually
present in the project, OR the tool is a standard Claude Code tool.
**Fail**: At least one deny rule references something that doesn't exist.
**N/A**: No rules in `deny`, or all deny rules are for standard tools.

**Detail format**: `"deny: Agent(retired-bot) has no matching subagent; mcp__old-server has no matching MCP server"`

---

## Scoring

Total: **14 checks**. Score = number of `pass` results (N/A counts as pass).

| Score | Grade |
|-------|-------|
| 14/14 | Excellent — permissions block is correct and follows best practices |
| 12–13/14 | Good — minor issues only |
| 10–11/14 | Needs work — several warn-level findings |
| < 10/14 | Security issues require immediate attention |
