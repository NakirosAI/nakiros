# Claude Code Hooks — Official Specification

> Source: Claude Code official documentation — hooks feature.

## Overview

Hooks are user-defined shell commands, HTTP endpoints, MCP tools, prompts, or
agents that execute automatically at specific points in Claude Code's lifecycle.
They allow you to enforce policy, audit actions, trigger side-effects, and
integrate with external systems.

Hooks are defined in `.claude/settings.json` (project scope), `~/.claude/settings.json`
(user scope), or local `settings.local.json`. This skill operates on **project scope
only** (`{project}/.claude/settings.json`).

## JSON structure

Hooks live under the `"hooks"` key. The structure has three levels of nesting:

```json
{
  "hooks": {
    "<HookEvent>": [
      {
        "matcher": "<pattern>",
        "hooks": [
          {
            "type": "<handler-type>",
            "<required-field>": "...",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Level 1 — Hook event key** (string): the lifecycle point at which this hook fires.
**Level 2 — Matcher group** (object): an entry in the event's array with a `matcher`
  field and a `hooks` array.
**Level 3 — Hook handler** (object): a single handler inside the matcher group's
  `hooks` array.

## Hook events (complete list)

### Per-session
| Event | When it fires |
|-------|--------------|
| `SessionStart` | At the start of a new session |
| `Setup` | During project setup |
| `SessionEnd` | At session end |

### Per-turn
| Event | When it fires |
|-------|--------------|
| `UserPromptSubmit` | When the user submits a prompt |
| `UserPromptExpansion` | When a prompt is expanded (e.g. slash command) |
| `Stop` | When Claude Code stops (turn ends) |
| `StopFailure` | When Claude Code stops due to an error |

### Per-tool-call
| Event | When it fires |
|-------|--------------|
| `PreToolUse` | Before a tool call executes |
| `PostToolUse` | After a successful tool call |
| `PostToolUseFailure` | After a failed tool call |
| `PostToolBatch` | After a batch of tool calls completes |
| `PermissionRequest` | When a permission is requested |
| `PermissionDenied` | When a permission is denied |

### Subagent / task
| Event | When it fires |
|-------|--------------|
| `SubagentStart` | When a subagent starts |
| `SubagentStop` | When a subagent stops |
| `TaskCreated` | When a task is created |
| `TaskCompleted` | When a task completes |

### Compaction
| Event | When it fires |
|-------|--------------|
| `PreCompact` | Before context compaction |
| `PostCompact` | After context compaction |

### Notification
| Event | When it fires |
|-------|--------------|
| `Notification` | On user notification events |
| `TeammateIdle` | When a teammate becomes idle |

### File / config
| Event | When it fires |
|-------|--------------|
| `InstructionsLoaded` | When instructions are loaded |
| `ConfigChange` | When configuration changes |
| `CwdChanged` | When the working directory changes |
| `FileChanged` | When a file changes |

### Worktree
| Event | When it fires |
|-------|--------------|
| `WorktreeCreate` | When a git worktree is created |
| `WorktreeRemove` | When a git worktree is removed |

### MCP
| Event | When it fires |
|-------|--------------|
| `Elicitation` | During MCP elicitation |
| `ElicitationResult` | After MCP elicitation result |

## Matcher patterns

The `matcher` field filters when a hook fires within an event type.

| Pattern | Meaning |
|---------|---------|
| `"*"`, `""`, or omitted | Match all |
| Letters/digits/`_`/`\|` only | Exact string or `\|`-separated list (e.g. `"Bash"` or `"Edit\|Write"`) |
| Any other character | Treated as a JS regex (e.g. `"^Notebook"`, `"mcp__memory__.*"`) |

### Events that IGNORE the matcher (silently)

The following events silently ignore any `matcher` field — set it and it has no effect:

- `UserPromptSubmit`
- `PostToolBatch`
- `Stop`
- `TeammateIdle`
- `TaskCreated`
- `TaskCompleted`
- `WorktreeCreate`
- `WorktreeRemove`
- `CwdChanged`

### Events where matcher targets the tool name

`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`

### Event-specific matcher values

| Event | Matcher meaning |
|-------|----------------|
| `SessionStart` | `startup` / `resume` / `clear` / `compact` |
| `Setup` | `init` / `maintenance` |
| `SessionEnd` | `clear` / `resume` / `logout` / etc. |
| `Notification` | `permission_prompt` / `idle_prompt` / etc. |
| `SubagentStart` / `SubagentStop` | Agent type name |
| `PreCompact` / `PostCompact` | `manual` / `auto` |
| `ConfigChange` | `user_settings` / `project_settings` / etc. |
| `FileChanged` | Literal filenames |
| `StopFailure` | Error type |
| `InstructionsLoaded` | Load reason |
| `UserPromptExpansion` | Command name |
| `Elicitation` / `ElicitationResult` | MCP server name |

## Handler types

### `command` (shell command)

```json
{
  "type": "command",
  "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/lint.sh",
  "async": false,
  "asyncRewake": false,
  "shell": "bash",
  "timeout": 30,
  "if": "Bash(rm *)"
}
```

Required: `command`

### `http` (HTTP endpoint)

```json
{
  "type": "http",
  "url": "https://hooks.example.com/claude",
  "headers": { "Authorization": "Bearer ${API_KEY}" },
  "allowedEnvVars": ["API_KEY"],
  "timeout": 30
}
```

Required: `url`

### `mcp_tool` (MCP tool call)

```json
{
  "type": "mcp_tool",
  "server": "memory",
  "tool": "add_observation",
  "input": { "entity": "${tool_input.path}", "content": "modified" },
  "timeout": 30
}
```

Required: `server`, `tool`
Note: `server` must be an already-connected MCP server name.

### `prompt` (Claude Code inline prompt)

```json
{
  "type": "prompt",
  "prompt": "Summarize what just happened",
  "model": "haiku",
  "timeout": 30
}
```

Required: `prompt`

### `agent` (experimental subagent hook)

```json
{
  "type": "agent",
  "prompt": "Validate the changes just made",
  "model": "sonnet",
  "timeout": 60
}
```

Required: `prompt`

## Common handler fields

| Field | Applies to | Description |
|-------|-----------|-------------|
| `type` | All (required) | Handler type: `command`, `http`, `mcp_tool`, `prompt`, `agent` |
| `if` | Tool events only | Permission rule syntax — e.g. `"Bash(git *)"`. Supported on: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` |
| `timeout` | All | Seconds before the hook is killed. Defaults: 600 (command), 30 (prompt), 60 (agent) |
| `statusMessage` | All | Custom spinner message shown while the hook runs |
| `once` | Skill frontmatter only | Honor once-per-session semantics (not in settings.json) |

## Exit codes for `command` handlers

| Code | Meaning |
|------|---------|
| `0` | Success — Claude Code parses stdout for optional JSON output |
| `2` | Blocking error — stderr is fed back to Claude as an error context. Blocks the associated action. |
| Other | Non-blocking error (except `WorktreeCreate` where any non-zero aborts) |

### Behavior of exit 2 per event

| Event | What happens on exit 2 |
|-------|----------------------|
| `PreToolUse` | Tool call is blocked |
| `PostToolUse` | Error reported to Claude |
| `UserPromptSubmit` | Prompt is rejected |
| `Stop` | Claude is forced to continue (does not stop) |
| `PermissionRequest` | Permission is denied |
| `SessionStart` | Session start is blocked |

## Path scripts

- `$CLAUDE_PROJECT_DIR` — absolute path to the project root. Use this for scripts
  under `.claude/hooks/` to stay portable and cwd-independent.
- `${CLAUDE_PLUGIN_ROOT}` — plugin install directory (for plugin hooks).
- `${CLAUDE_PLUGIN_DATA}` — plugin persistent data directory.

## Disabling all hooks

Set `"disableAllHooks": true` at the top level of `settings.json`. This respects
the settings hierarchy (managed → user → project → local).

## Best practices

- **Use `if` for narrow matching** on tool events — avoids spawning a process for
  every tool call when you only care about specific patterns.
- **Use `$CLAUDE_PROJECT_DIR`** for script paths — ensures the path is absolute and
  cwd-independent. Wrap in quotes if the path may contain spaces.
- **Use `exit 2` to block** — `exit 1` (or any non-2 non-zero) is non-blocking by
  default. Only `exit 2` reliably blocks the associated action.
- **Set `timeout` explicitly** — the default (600s for commands) is often too long
  for interactive hooks. Short-circuit linters should use 10–30s.
- **HTTPS for `http` hooks** — never use plain HTTP in production. Credentials may
  travel in headers.
- **Document side-effects** — if the hook writes files, sends requests, or modifies
  state, document this in a comment or nearby `README.md`.
- **Idempotency** — prefer idempotent hooks (re-running produces the same result).
  If not possible, document it clearly.
