# Claude Code Subagents — Official Specification

> Source: Claude Code official documentation — subagents feature.

## Overview

Subagents are specialised AI assistants that run in their own context window.
They are defined as Markdown files with YAML frontmatter. The main Claude Code
session can delegate tasks to them via `@name` mentions or automatic delegation
based on the subagent's description.

> Key difference from rules and skills: subagents run in a **separate context
> window** and do NOT inherit the parent session's CLAUDE.md or conversation
> history.

## Storage locations

| Scope | Path |
|-------|------|
| Project | `.claude/agents/<name>.md` |
| User | `~/.claude/agents/<name>.md` |
| Plugin | plugin's `agents/` directory |

Project subagents override user subagents with the same name.

Discovery is **recursive** — subdirectories under `.claude/agents/` are scanned.

## Frontmatter — required fields

### `name`

```yaml
name: code-reviewer
```

- Lowercase letters and hyphens only — regex: `/^[a-z][a-z0-9-]*$/`
- No spaces, no uppercase, no underscores
- Must be unique within the project
- Used for `@name` mentions and auto-delegation matching

### `description`

```yaml
description: >
  Use proactively when reviewing pull requests or any code change.
  For code review tasks, diff analysis, style checks, and security
  audits. When asked to review a file or function, delegate here.
```

- Tells Claude when to delegate to this subagent
- Must contain delegation trigger phrases: "use", "for", "when", "proactively"
- Specificity is critical — vague descriptions mean no auto-delegation
- Think: "If the main agent reads this and is given a task, when will it pick this?"

## Frontmatter — optional fields

### `tools`

```yaml
tools:
  - Read
  - Bash
  - WebSearch
```

Allowlist. If specified, the subagent only has access to these tools. If
omitted, the subagent inherits all tools from the main session.

### `disallowedTools`

```yaml
disallowedTools:
  - Write
  - Edit
```

Denylist. Removes tools from the inherited or explicitly specified list.
`disallowedTools` applies on top of `tools` if both are set.

### `model`

```yaml
model: sonnet          # or: haiku, opus, inherit, or full model ID
```

- `sonnet` — balanced reasoning, most implementation tasks
- `haiku` — fast and cheap, ideal for read-only exploration
- `opus` — hard reasoning, architecture, complex multi-step tasks
- `inherit` — uses whatever model the parent session is using (default)
- Full model ID — e.g. `claude-opus-4-5-20251101`

### `permissionMode`

```yaml
permissionMode: auto    # or: default, acceptEdits, dontAsk, bypassPermissions, plan
```

- `default` — standard permission prompts
- `acceptEdits` — auto-accepts file edits without prompting
- `auto` — automatically approves most tool use
- `dontAsk` — skips most permission prompts (use with care)
- `bypassPermissions` — removes all safety rails (DANGEROUS — requires explicit justification)
- `plan` — read-only planning mode, no writes

### `maxTurns`

```yaml
maxTurns: 10
```

Maximum agentic turns before the subagent stops.

### `skills`

```yaml
skills:
  - code-documentation
  - nakiros-skill-factory
```

List of skill names to preload at startup. The full skill content is injected
into the subagent's context. Skills are NOT inherited from the parent — list
explicitly what the subagent needs.

### `mcpServers`

```yaml
mcpServers:
  - my-db-mcp
```

List of MCP server names (or inline definitions) available to the subagent.

### `hooks`

```yaml
hooks:
  PostToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "echo 'bash used'"
```

Lifecycle hooks scoped to this subagent (PreToolUse, PostToolUse, Stop).

### `memory`

```yaml
memory: project    # or: user, local
```

Persistent memory scope for this subagent.

### `background`

```yaml
background: true
```

If `true`, the subagent always runs as a background task (default: `false`).

### `effort`

```yaml
effort: high    # or: low, medium, xhigh, max
```

Controls reasoning effort / token budget.

### `isolation`

```yaml
isolation: worktree
```

If `worktree`, the subagent runs in a temporary git worktree.

### `color`

```yaml
color: blue    # or: red, green, yellow, purple, orange, pink, cyan
```

Visual colour for the subagent in the UI.

### `initialPrompt`

```yaml
initialPrompt: "Analyse the repository structure and summarise key patterns."
```

Auto-submitted as the first user turn when the subagent is run as a main
session (not when delegated to from another agent).

## Body

The body is the system prompt given to the subagent. Important:

- The subagent receives **only this system prompt** plus basic environment
  details (current directory, date, etc.)
- It does **NOT** receive the main session's CLAUDE.md or conversation history
- Write in imperative mood — this is an instruction set, not a description
- Be explicit about domain scope, style constraints, and output format
- Include concrete examples of expected behaviour

## Best practices

### Single domain focus

One subagent = one domain. A "do everything" subagent delegates nothing
effectively. If you find yourself writing "AND also handles X", split it.

### Description triggers delegation

The description is the delegation signal. Include:
- "Use proactively for X" — triggers on matching tasks
- "For Y tasks" — scopes to a category
- "When Z" — conditional trigger
- Specific noun phrases from real user requests

### Tool scoping

Principle of least privilege. A subagent that only reads files should not have
`Write` or `Edit`. Remove what you don't need:

```yaml
# Read-only exploration agent
tools:
  - Read
  - Bash
  - Glob
```

### Model selection

| Task type | Recommended model |
|-----------|------------------|
| File reading, grep, exploration | `haiku` |
| Code implementation, moderate reasoning | `sonnet` |
| Architecture design, complex debugging | `opus` |
| Mixed/unknown | `inherit` (defaults to Sonnet) |

### Imperative body

Write the body as direct commands, not capability descriptions:

```
# Good — imperative
Always read MEMORY.md before starting any task.
Never modify files in dist/ directly.
Use the existing runner-core primitives instead of writing new ones.

# Bad — descriptive
This agent is capable of reading memory files and has knowledge of the
dist/ directory conventions.
```

### Context self-sufficiency

Because the subagent has no CLAUDE.md and no parent conversation history,
every piece of context it needs must be in the body. Reference specific file
paths, link to docs, and spell out constraints explicitly.

## Built-in subagents

Claude Code ships three built-in subagents:

| Name | Model | Tools | Purpose |
|------|-------|-------|---------|
| `Explore` | Haiku | Read-only (Read, Bash read-only, Glob, Grep) | Fast codebase exploration without mutation risk |
| `Plan` | Sonnet | Read-only, plan mode | Architecture planning and design thinking |
| `general-purpose` | Sonnet | All tools | General tasks when no specialised subagent applies |

These built-ins are always available and cannot be overridden.

## Discovery example

```
.claude/
├── agents/
│   ├── backend.md          → @backend, project scope
│   ├── frontend.md         → @frontend, project scope
│   └── security/
│       └── auditor.md      → @auditor, project scope (subdirectory OK)
```

```bash
find .claude/agents -name '*.md'
# .claude/agents/backend.md
# .claude/agents/frontend.md
# .claude/agents/security/auditor.md
```
