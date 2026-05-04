# Claude Code Permissions — Official Specification

> Source: Claude Code official documentation — permissions feature.

## Overview

Permissions is a three-level control system that determines what Claude Code
is allowed to do without prompting, what requires a confirmation, and what is
always blocked. Rules live under the `"permissions"` key of `.claude/settings.json`
(project scope), `~/.claude/settings.json` (user scope), or
`settings.local.json` (local override). This skill operates on **project scope
only** (`{project}/.claude/settings.json`).

## JSON structure

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(./src/**)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Bash(rm -rf *)", "Edit(./.env*)"],
    "defaultMode": "default",
    "additionalDirectories": ["~/shared"],
    "disableBypassPermissionsMode": "disable",
    "disableAutoMode": "disable"
  }
}
```

## Rule evaluation order

`deny → ask → allow`

**Deny always wins.** If a command matches both a deny rule and an allow rule,
deny takes precedence. This is the key invariant to understand when designing
a permissions block.

## Permission modes (`defaultMode`)

| Value | Behaviour |
|-------|-----------|
| `default` | Prompt on first use of each tool in each session |
| `acceptEdits` | Auto-accept file edits + filesystem commands (`mkdir`, `touch`, `mv`, `cp`) |
| `plan` | Analyze-only mode — no `modify` or `execute` actions |
| `auto` | Auto-approves with safety checks (research preview) |
| `dontAsk` | Auto-deny all tool calls except those pre-approved in `allow` |
| `bypassPermissions` | Skip ALL prompts (⚠️ DANGEROUS — root/home `rm` prompts act as circuit breakers) |

**Recommendation**: prefer `default` or `acceptEdits`. Never use
`bypassPermissions` unless you fully understand the consequences and have
explicit external safety controls.

## Rule syntax

Every rule is a string of the form:

```
Tool
Tool(specifier)
```

- `Tool` alone — applies to all uses of that tool (e.g. `Bash`, `Read`, `Edit`, `Write`, `WebFetch`)
- `Tool(specifier)` — applies only when the tool input matches the specifier

**Format regex** (for validation): `^[A-Z][A-Za-z]+(\(.+\))?$`

## Tools without specifier

| Rule | Matches |
|------|---------|
| `Bash` | All Bash commands |
| `Read` | All file reads |
| `Edit` | All file edits |
| `Write` | All file writes |
| `WebFetch` | All web fetch requests |

## Bash specifiers

Wildcards `*` work at any position in the specifier:

| Example | Matches |
|---------|---------|
| `Bash(npm run *)` | `npm run build`, `npm run test`, ... |
| `Bash(git * main)` | `git push main`, `git pull main`, ... |
| `Bash(* --version)` | Any command with `--version` flag |

**`:*` suffix** is equivalent to ` *` — `Bash(ls:*)` = `Bash(ls *)`. Use the
space form for clarity.

## Compound commands

Compound commands are split on `&&`, `||`, `;`, `|`, `|&`, `&`, and newlines.
**A permission rule must match EACH subcommand individually.**

```bash
# This compound command:
npm run build && echo done

# Is evaluated as TWO subcommands:
# 1. npm run build  → matched by Bash(npm run *)
# 2. echo done      → matched by Bash(echo *) or prompted
```

**Process wrappers stripped** (before matching): `timeout`, `time`, `nice`,
`nohup`, `stdbuf`, bare `xargs`.

**Wrappers NOT stripped** (match as-is): `watch`, `setsid`, `ionice`, `flock`,
`find -exec`, `find -delete`.

## Read-only commands (built-in allow)

These commands never prompt, regardless of permissions configuration:
`ls`, `cat`, `head`, `tail`, `grep`, `find`, `wc`, `diff`, `stat`, `du`, `cd`,
and read-only forms of `git`.

**To force a prompt** on these commands, use a `PreToolUse` hook with `exit 2`
— deny rules have no effect on built-in allowed commands.

## Read/Edit/Write specifiers (gitignore-style patterns)

| Pattern | Meaning |
|---------|---------|
| `//path` | Absolute path from filesystem root |
| `~/path` | From home directory |
| `/path` | Relative to project root |
| `path` or `./path` | Relative to current directory |
| `**` | Any subdirectory depth (glob) |
| `*` | Any file/dir name at this level |

Examples:
- `Read(./src/**)` — all files under `./src/`
- `Edit(./.env*)` — all files matching `.env*` in current dir
- `Write(//tmp/**)` — all files under `/tmp/`

## WebFetch specifier

`WebFetch(domain:example.com)` — restrict fetches to a specific domain.

## MCP specifiers

| Pattern | Matches |
|---------|---------|
| `mcp__server` | Exact server prefix (all tools from server) |
| `mcp__server__*` | Wildcard — same effect as above |
| `mcp__server__tool` | Specific tool from server |

## Agent specifiers

`Agent(AgentName)` — restrict invocation of a specific subagent by name.

## Additional settings

### `additionalDirectories`

Array of directory paths the agent can access outside the project root.

```json
"additionalDirectories": ["~/shared", "//usr/local/bin"]
```

### `disableBypassPermissionsMode`

Set to `"disable"` to prevent the agent from activating `bypassPermissions`
mode interactively.

```json
"disableBypassPermissionsMode": "disable"
```

### `disableAutoMode`

Set to `"disable"` to prevent the agent from activating `auto` mode.

```json
"disableAutoMode": "disable"
```

## Best practices

- **Deny dangerous Bash patterns** — always include `Bash(rm -rf *)`,
  `Bash(curl *)`, `Bash(wget *)`, `Bash(sudo *)` in deny unless explicitly
  justified with a comment.
- **Protect secrets** — always include `Read(./.env*)` and `Edit(./.env*)`
  in deny. Consider `Read(./.git/**)` for git internals.
- **Prefer `default` over `bypassPermissions`** — `default` prompts once per
  session for each tool, which is a good balance between safety and ergonomics.
- **Use `acceptEdits` for trusted dev** — auto-accepts file edits without
  prompting, but still prompts for network calls, Bash, etc.
- **Use `ask` for sensitive destructive actions** — `ask: ["Bash(git push *)"]`
  means you confirm every push, even in otherwise auto-approve sessions.
- **Narrow `allow` to what's needed** — `Bash(npm run *)` is much safer than
  `Bash`. Over-broad allow rules negate the security model.
- **Bash specifiers are fragile for complex validations** — for domain-specific
  allow/deny logic (e.g. "only allow curl to specific domains"), prefer a
  `PreToolUse` hook that can run arbitrary validation logic.
- **Set `disableBypassPermissionsMode: "disable"`** in production to lock out
  the nuclear option.

## Settings hierarchy

`managed → user (~/.claude/settings.json) → project (.claude/settings.json) → local (settings.local.json)`

Lower levels can add rules but cannot override `disableBypassPermissionsMode: "disable"`
set at a higher level.
