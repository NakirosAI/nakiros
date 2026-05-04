# Claude Code Output Styles — Official Specification

> Source: Claude Code official documentation — output styles feature.

## Overview

**Output styles** modify how Claude responds — role, tone, format — without
changing its capabilities (tools remain fully available). They are the
equivalent of "persona presets" that users or teams can switch between.

Once selected via `/config`, the active output style affects every response in
the main loop until changed. They are **always active** (not task-specific).

## Format

Output styles are Markdown files with YAML frontmatter:

```markdown
---
name: My Custom Style
description: A brief description shown in /config picker
keep-coding-instructions: false
---

# Custom Style Instructions

You are an interactive CLI tool that helps users with software engineering
tasks. [Custom instructions...]

## Specific Behaviors

[Define how the assistant should behave...]
```

## Frontmatter fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | filename | Name shown in the `/config` style picker |
| `description` | string | — | Short description visible in `/config` (UX critical) |
| `keep-coding-instructions` | boolean | `false` | If `true`, Claude Code's default coding instructions are preserved alongside the style |

### Notes on frontmatter

- `name` is **optional** — if absent, Claude Code uses the filename (without
  `.md`) as the display name in the picker. However, a well-chosen `name`
  makes the picker more navigable for users.
- `description` is displayed directly in the `/config` menu. A missing or
  vague description forces users to open the file to understand what the style
  does — avoid this.
- `keep-coding-instructions: true` is useful for styles that modify tone/format
  but still want Claude to use its built-in coding expertise. The default
  (`false`) replaces the coding system prompt with the style body.

## Storage locations

| Scope | Path |
|-------|------|
| Project | `.claude/output-styles/<name>.md` |
| User | `~/.claude/output-styles/<name>.md` |
| Plugin | `<plugin>/output-styles/<name>.md` |

Nakiros V1 audits **project-scope** styles only (`user` and `plugin` scopes
are deferred to a future release).

## Built-in styles (for reference)

Claude Code ships three built-in styles:

- **Default** — coding-optimised system prompt, no decoration
- **Explanatory** — adds pedagogical insights and teaches the why
- **Learning** — collaborative mode with `TODO(human)` markers for skill transfer

Custom styles should differentiate clearly from these built-ins.

## Output styles vs other mechanisms

| Mechanism | Effect | Always active? | Replaces system prompt? |
|-----------|--------|---------------|------------------------|
| Output style | Role, tone, format | Yes (once selected) | Yes (unless `keep-coding-instructions: true`) |
| CLAUDE.md | Project context, constraints | Yes (appended as user message) | No — additive |
| `--append-system-prompt` | Injected text | Yes | No — appended |
| Subagent | Delegated task | No (task-specific) | Per-subagent |
| Skill | Invoked procedure | No (on-demand) | No |

**Key distinction**: output styles *replace* the system prompt by default.
CLAUDE.md and `--append-system-prompt` are *additive* — they append to
whatever prompt is active (including the active output style body).

## Best practices

### Role definition

- Start with a clear persona: `"You are X"`, `"Act as Y"`, `"Tu es Z"`
- Be specific: `"You are a senior TypeScript reviewer focused on type safety"`
  is better than `"You are a helpful assistant"`
- Avoid circular definitions: `"You are a style guide"` — a style guide for what?

### Tone and format

- Explicitly state tone: formal/informal, verbose/terse, encouraging/direct
- Specify output format: markdown, prose, tables, code blocks, bullets
- State what you do NOT want: `"Never use bullet points"`, `"Avoid
  lengthy preambles"`

### Imperative mood

- Use direct imperatives: `"You are"`, `"Always respond in"`, `"Never use"`,
  `"Format all code as"`, `"Keep responses under N lines"`
- Avoid hedges: ~~`"You should consider"`~~, ~~`"You may want to"`~~,
  ~~`"It might be helpful to"`~~
- Every instruction must be actionable on its own

### Length constraint

- Target **≤ 200 lines** — a style is not a manual
- If you need more, you have multiple concerns — split into separate styles or
  move project-specific constraints to CLAUDE.md
- Body must have **≥ 5 lines** — a one-liner style provides no value

### Interaction with CLAUDE.md

- If `keep-coding-instructions: false` (default), the style body **replaces**
  the system coding prompt. Write the style as if it is the only context.
- CLAUDE.md content is always appended as a user message regardless —
  no conflict there.
- Only flag a conflict if the style *explicitly* contradicts CLAUDE.md
  directives (e.g. style says "never explain your reasoning" but CLAUDE.md
  says "always justify refactoring decisions").

## Common pitfalls

- **No role defined**: style tells Claude to "respond concisely" but never
  defines what role it is playing — vague styles produce inconsistent results
- **Hedges everywhere**: `"should consider"`, `"may want to"` — Claude follows
  hedges inconsistently; imperatives are more reliable
- **Duplicate role with another style**: two styles both claim the "senior
  backend reviewer" persona — the second one is redundant
- **Overlong**: 300+ lines of instructions blur the persona and slow context
  loading; focus on the 20% of instructions that drive 80% of behaviour
- **Missing description**: users cannot identify the style in `/config`
  without opening the file
