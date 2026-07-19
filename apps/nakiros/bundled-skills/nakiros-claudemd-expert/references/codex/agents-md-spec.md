# Codex AGENTS.md specification

Use this reference only when the explicit provider is `codex`.

## Discovery and precedence

- Codex builds one instruction chain before work begins.
- User-level instructions come from the Codex home directory.
- Project instructions are discovered from the repository root down to the current working directory.
- At each directory level, `AGENTS.override.md` takes precedence over `AGENTS.md`.
- Instructions closer to the working directory override earlier instructions.
- The root `AGENTS.md` should contain only repository-wide guidance. Put narrower guidance in nested files rather than growing the root indefinitely.

## Content quality

- State repository layout and authoritative documentation with repo-relative paths.
- State hard constraints as imperative, testable instructions.
- Include exact validation commands verified from project files.
- Record non-obvious conventions and failure-prone boundaries, not facts obvious from code.
- Keep instructions concise because they consume context in every matching task.
- Do not invent commands, paths, policies, tools, or architecture.

## Imports and provider boundaries

- Do not add Claude-specific `@import` syntax to `AGENTS.md`.
- Do not describe `.claude/` behavior as if Codex consumed it.
- Reference Codex-native resources (`.codex/config.toml`, `.codex/rules/`, `.codex/agents/`, `.agents/skills/`) only when they actually exist or the user explicitly requests them.
- Preserve existing nested `AGENTS.md` and `AGENTS.override.md` files; the Nakiros instruction runner deploys only the selected root draft.

## Scope

The current Nakiros lifecycle targets `{project}/AGENTS.md`. Nested files are visible as project resources but are not rewritten by a root audit/fix/create/edit run.
