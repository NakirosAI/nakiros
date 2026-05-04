# Claude Code Rules — Official Specification

> Source: Claude Code official documentation — `.claude/rules/` feature.

## Overview

The `.claude/rules/` directory lets you organise project instructions into
multiple focused files. Rules keep instructions modular and easier for teams to
maintain. Rules can be scoped to specific file paths, so they only load into
context when Claude works with matching files — reducing noise and saving
context space.

> Rules load into context every session or when matching files are opened. For
> task-specific instructions that don't need to be in context all the time, use
> skills instead.

## Setting up rules

Place markdown files in your project's `.claude/rules/` directory. Each file
should cover **one topic**, with a descriptive filename like `testing.md` or
`api-design.md`. All `.md` files are discovered **recursively**, so you can
organise rules into subdirectories like `frontend/` or `backend/`.

Rules without `paths` frontmatter are loaded at launch with the same priority
as `.claude/CLAUDE.md`.

## Path-specific rules

Rules can be scoped to specific files using YAML frontmatter with the `paths`
field. These conditional rules only apply when Claude is working with files
matching the specified patterns.

Example:

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules

- All API endpoints must include input validation
- Use the standard error response format
- Include OpenAPI documentation comments
```

Rules **without** a `paths` field are loaded unconditionally and apply to all
files. Path-scoped rules trigger when Claude reads files matching the pattern,
not on every tool use.

### Glob patterns supported

| Pattern | Matches |
|---------|---------|
| `**/*.ts` | All `.ts` files recursively |
| `src/**/*` | All files under `src/` |
| `*.md` | Markdown files at root |
| `src/components/*.tsx` | `.tsx` files directly under `src/components/` |
| `src/**/*.{ts,tsx}` | Both `.ts` and `.tsx` files under `src/` |

Brace expansion (`{ts,tsx}`) is supported.

## Sharing rules across projects with symlinks

The `.claude/rules/` directory supports symlinks. Symlinks are resolved and
loaded normally; circular symlinks are detected and skipped.

## User-level rules

Personal rules in `~/.claude/rules/` apply to every project. User-level rules
are loaded **BEFORE** project rules, so project rules have higher priority and
can override user defaults.

## Load priority (highest → lowest)

1. **Project rules** (`.claude/rules/*.md`) — highest
2. **User rules** (`~/.claude/rules/*.md`)
3. **CLAUDE.md** (project then user)

Within the same level, the loading order is undefined; avoid relying on it.

## Rule vs skill: when to use which

| Signal | Use rule | Use skill |
|--------|----------|-----------|
| Convention that always applies | Yes | No |
| Scoped to specific file types | Yes (paths:) | No |
| Complex multi-step procedure | No | Yes |
| Loaded every session automatically | Yes | No |
| Invoked on demand | No | Yes |

## Recommended rule structure

```markdown
---
paths:
  - "glob/pattern/**/*.ts"
---

# Rule Title (one clear topic)

Brief one-sentence context (optional).

## How (or: Rules)

- **Always** do X when Y
- **Never** Z in file type T
- Use `SpecificApi` from `path/to/module`

## Example

\`\`\`lang
// concrete code example
\`\`\`
```

Keep rules under **150 lines**. If a rule grows beyond that, split into two
focused rules rather than one catch-all.
