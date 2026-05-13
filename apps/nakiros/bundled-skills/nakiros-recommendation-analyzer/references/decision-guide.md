# Choosing the right artefact type

Eight `.claude/` artefact types are available. Pick based on the friction's nature.

## `rules`
A markdown file under `.claude/rules/` that auto-attaches to Claude Code context when matching files are edited (via a `paths:` glob in frontmatter).

**Use when:** the friction recurs whenever the developer or agent touches a specific area of the codebase (e.g. i18n flows, IPC handlers, runners). A rule auto-injects guidance the moment it becomes relevant.

## `skill`
A SKILL.md + references/ workflow that can be invoked explicitly or auto-loaded based on description triggers.

**Use when:** the friction is about HOW to do a complex multi-step task (e.g. "create a new IPC channel and wire it across 4 files"). A skill encodes the workflow once and can be re-invoked.

## `claudemd`
The project's `CLAUDE.md` (or a sub-directory CLAUDE.md). High-level always-loaded context.

**Use when:** the friction is about general project conventions, routing decisions, or invariants that apply to most work in the repo. Use sparingly — CLAUDE.md is always loaded so every byte costs context.

## `subagent`
A specialist subagent file under `.claude/agents/`. The main agent can delegate work to it via the Agent tool.

**Use when:** the friction shows the main agent loading too much context for a focused sub-task. A subagent isolates context per scope (e.g. one for `apps/frontend/**`, one for `apps/nakiros/**`).

## `hook`
An event-driven script wired in `.claude/settings.json` under `hooks`. Runs on Claude Code lifecycle events (pre-tool-use, post-tool-use, stop, etc.).

**Use when:** the friction can be prevented by a deterministic check (lint, tsc, etc.) rather than instruction. Hooks are non-LLM enforcement.

## `permission`
The `permissions` block in `.claude/settings.json` — allow/deny rules for tool use.

**Use when:** the friction is about the agent being blocked by repeated permission prompts on safe commands, OR about the agent doing things it shouldn't. Permissions are about authorisation, not behaviour.

## `mcp`
A Model Context Protocol server declared in `.mcp.json` — exposes external tools/resources to Claude Code.

**Use when:** the friction is the agent lacking access to a specific data source (a database, an API, a knowledge base). Adding an MCP server gives durable tool access.

## `output-style`
A markdown file under `.claude/output-styles/` defining how the agent responds (formal vs casual, language, length).

**Use when:** the friction is the agent's communication style mismatching the user's preferences (e.g., too verbose, wrong language).

## Decision shortcut

| Friction shape | First-line artefact |
|----------------|---------------------|
| "agent didn't know convention X when touching files Y" | `rules` |
| "agent took 5 wrong turns on a complex task" | `skill` |
| "agent missed a project invariant that applies everywhere" | `claudemd` |
| "main agent loaded too much context for sub-task X" | `subagent` |
| "agent broke X that a hook could catch" | `hook` |
| "agent kept asking permission for safe command X" | `permission` |
| "agent didn't have access to database/API X" | `mcp` |
| "agent's responses don't match user's tone/language" | `output-style` |

When in doubt between `rules` and `skill`: rules are CONTEXT (auto-attached guidance), skills are WORKFLOW (explicit invocation). If the user needs reminding, use a rule. If the user needs steps, use a skill.
