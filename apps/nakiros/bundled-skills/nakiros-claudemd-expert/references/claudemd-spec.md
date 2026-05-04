# CLAUDE.md — Specification + Best Practices

> Source: https://docs.anthropic.com/en/docs/claude-code/memory + observed Nakiros patterns.

## What CLAUDE.md is

CLAUDE.md is a per-project (or per-user) memory file Claude Code loads into the context of every session opened in that directory. It is the highest-leverage place to encode project conventions, hard constraints, and gotchas — but every line consumes the conversation budget.

## Scope levels

| Path | Loaded for |
|------|-----------|
| `~/.claude/CLAUDE.md` | All sessions of the user, every project |
| `{project}/CLAUDE.md` | Sessions opened anywhere in `{project}` |
| `{project}/{app}/CLAUDE.md` | Sessions opened inside `{app}` (composes with parent) |

Composition is additive: a session inside `apps/web/` loads root `CLAUDE.md` AND `apps/web/CLAUDE.md`. Avoid duplicating content between levels — scope each file to what is unique at that level.

## Recommended structure

A CLAUDE.md should answer four questions, in this order:

1. **What is this project?** — One sentence. Stack. Runtime.
2. **Where do things live?** — Architecture pointers. Link to a longer `ARCHITECTURE.md` if it exists, do not inline it.
3. **What are the hard rules?** — Mandatory constraints the agent must respect: IPC contracts, naming conventions, security boundaries, "never edit X", "always import from Y".
4. **What are the gotchas?** — Load-bearing patterns the agent will get wrong without warning.

Optional but high-value: validation commands (the exact `pnpm`, `cargo`, `pytest` commands the agent should run before declaring work done).

## Size budget

- **Soft target**: under 100 lines.
- **Hard ceiling**: under 200 lines. Beyond that, attention degrades measurably.
- If you have more material: split into rules under `.claude/rules/` (scoped via `paths:` frontmatter) and link them from CLAUDE.md.

## Tone

Write in **imperative mood**:
- ✓ "Use `IPC_CHANNELS` from `@nakiros/shared` everywhere."
- ✗ "You should consider using IPC_CHANNELS for consistency."

Banned hedges: *consider*, *think about*, *be careful*, *appropriately*, *as needed*, *usually*, *generally*.

Banned filler:
- ✗ "This is a very important project that handles..."
- ✗ "Make sure your code is high-quality and well-tested."
- ✓ "Run `pnpm test` before every commit. Failing tests block the merge."

## Content rules

### DO include

- Hard rules with concrete file paths, function names, environment variables.
- Validation commands that actually exist in `package.json` / `Makefile` / equivalent.
- Project-specific gotchas the agent has actually fallen into (sourced from frictions, user feedback, or known incidents).
- Pointers to authoritative docs (ARCHITECTURE.md, ADRs, schema files).

### DO NOT include

- Generic software engineering advice ("write clean code", "handle errors").
- Verbose WHY explanations — link to a doc if the why is needed.
- Information already obvious from a 30-second look at the codebase (e.g. "we use TypeScript" when there's a `tsconfig.json`).
- Marketing language ("our awesome platform", "world-class engineering").
- Vague meta-advice ("think about edge cases", "be thorough").

## Path conventions

All paths in CLAUDE.md must be:
- **Repo-relative** (preferred): `apps/nakiros/src/daemon/server.ts`
- **Or absolute**: `/Users/foo/proj/apps/nakiros/...`

Never write `./apps/...` — ambiguous depending on where the agent is.

## Anti-pattern: bullet-list dumping

Avoid CLAUDE.md files that are 100+ bullets without sections. Group into 3-6 named sections, each with at most 7 items. If a section grows past 7 items, it's two sections in disguise.

## Examples

### Good (Nakiros root CLAUDE.md, abridged)

```markdown
# Nakiros — Claude Entry Point

Canonical project memory is `ARCHITECTURE.md` at the repo root. Read it
first for layout, runtime, and IPC contract.

## Mandatory constraints

- Use `IPC_CHANNELS` from `@nakiros/shared` everywhere. **No hardcoded
  channel name strings** in handlers, registry, client, or d.ts.
- Tailwind-first styling. No inline `style={{...}}` unless unavoidable.
- i18n via `useTranslation(namespace)` only. No `isFr` / FR-EN ternaries.

## Validation before closing

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
turbo build
```
```

### Bad

```markdown
# Project notes

Welcome to our awesome project! This is a really important codebase
that powers our world-class platform.

## Things to remember

- Be careful when editing the database
- Make sure to test your code thoroughly
- Consider edge cases
- Write clean, maintainable code
- Follow best practices
- ...
```

(Vague, non-actionable, no project specifics, marketing tone.)

## Gotchas

- The agent loads CLAUDE.md every turn — every byte you write costs every conversation. Edit aggressively.
- Two CLAUDE.md files at different scope levels do NOT override — they compose. Audit redundancy.
- A CLAUDE.md generated from a generic template (without scanning the actual project) is worthless. Always derive content from the codebase, frictions, or explicit user input.
- Putting test commands in CLAUDE.md only helps if those commands actually pass. If `pnpm test` is broken, the agent will run it, see the failure, and either retry blindly or panic. Verify commands work before adding them.
