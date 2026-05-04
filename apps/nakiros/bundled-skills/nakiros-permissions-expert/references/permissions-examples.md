# Permissions Examples

Three annotated examples illustrating the spectrum from well-secured to
dangerous configurations. Use these as references when auditing and fixing.

---

## Example 1 — Well-secured permissions block

Every best practice applied: dangerous Bash denied, secrets protected,
`defaultMode` is `acceptEdits`, bypass mode disabled, narrow allow rules.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(pnpm run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(tsc *)",
      "Read(./src/**)",
      "Read(./packages/**)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git commit *)",
      "Bash(npm publish *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(sudo *)",
      "Read(./.env*)",
      "Edit(./.env*)",
      "Read(./.git/**)",
      "Edit(./.git/**)"
    ],
    "defaultMode": "acceptEdits",
    "disableBypassPermissionsMode": "disable"
  }
}
```

**Why this is good**:
- `deny` covers all four recommended dangerous Bash patterns
- `.env*` files are protected from both reads and edits
- `.git/**` internals are off-limits
- `ask` for destructive git operations (push, commit, publish) — human confirms
- `allow` is narrow: only specific `npm run *` / `pnpm run *` patterns
- `defaultMode: acceptEdits` — smooth for file edits, still prompts for Bash
- `disableBypassPermissionsMode: "disable"` — locks out the nuclear option

**Audit score**: 14/14

---

## Example 2 — Too permissive configuration

A block that works but has significant security gaps: no deny rules,
`defaultMode` too broad, bypass mode not locked.

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Edit",
      "Write"
    ],
    "defaultMode": "acceptEdits"
  }
}
```

**Issues and their check IDs**:

| Issue | Check | Severity |
|-------|-------|----------|
| No `Bash(rm -rf *)` in deny | `security.dangerous_bash_denied` | Info |
| No `.env*` protection in deny | `security.env_files_denied` | Warn |
| `allow: ["Bash"]` — all Bash allowed, deny can't override what's never blocked | `security.dotclaude_writes_denied` | Warn (unrestricted Edit allows .claude writes) |
| No `disableBypassPermissionsMode` set | (no fail, but unprotected) | — |

**What to fix**:
1. Add `deny: ["Bash(rm -rf *)", "Bash(curl *)", "Bash(wget *)", "Bash(sudo *)", "Read(./.env*)", "Edit(./.env*)"]`
2. Narrow `allow: ["Bash"]` to specific patterns like `allow: ["Bash(npm run *)"]`
3. Add `"disableBypassPermissionsMode": "disable"`

**Audit score**: ~10/14

---

## Example 3 — Invalid/dangerous configuration

A block with format errors, an active bypass mode, and stale cross-references.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run build",
      "read(./src/**)",
      "Edit()"
    ],
    "deny": [
      "Agent(retired-bot)",
      "mcp__decommissioned-server__*"
    ],
    "defaultMode": "bypassPermissions",
    "unknownKey": true
  }
}
```

**Issues and their check IDs**:

| Issue | Check | Severity |
|-------|-------|----------|
| `defaultMode: "bypassPermissions"` — disables ALL prompts | `security.default_mode_not_bypass` | Critical |
| `unknownKey: true` in permissions block | `structure.permissions_keys_known` | Warn |
| `"Bash(npm run build"` — unbalanced parentheses | `syntax.allow_rules_valid` + `structure.rule_format` | Warn |
| `"read(./src/**)"` — starts with lowercase | `structure.rule_format` | Warn |
| `"Edit()"` — empty specifier | `syntax.allow_rules_valid` + `structure.rule_format` | Warn |
| `Agent(retired-bot)` — no matching subagent | `crossref.agent_rules_match_subagents` + `crossref.no_useless_deny_for_undefined_tools` | Warn + Info |
| `mcp__decommissioned-server__*` — no matching MCP server | `crossref.mcp_rules_match_servers` + `crossref.no_useless_deny_for_undefined_tools` | Warn + Info |
| No `.env*` protection | `security.env_files_denied` | Warn |
| No dangerous Bash denied | `security.dangerous_bash_denied` | Info |

**What the audit report should say for Priority Fixes**:

```
### Critical
- defaultMode is bypassPermissions — ALL permission prompts are disabled, including
  safety circuit breakers for root/home directory deletion. Change to "default" or
  "acceptEdits" immediately.

### Important
- allow: "Bash(npm run build" has unbalanced parentheses — rule is likely ignored
- allow: "read(./src/**)" starts with lowercase — not a valid tool name
- allow: "Edit()" has empty specifier — ambiguous, use "Edit" without parens
- Unknown key "unknownKey" in permissions block — remove it
- deny: Agent(retired-bot) — no subagent with this name exists, stale rule
- deny: mcp__decommissioned-server__* — no MCP server with this name, stale rule
- No .env* protection in deny — secrets are exposed

### Minor
- No dangerous Bash patterns in deny — add Bash(rm -rf *) and others as recommended
```

**Audit score**: ~3/14 (critical fail + many warn fails)
