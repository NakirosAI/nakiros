# Nakiros — Entry Point

Project memory: [`ARCHITECTURE.md`](ARCHITECTURE.md) (root). Technical docs:
[`docs/technical/`](docs/technical/README.md) — TSDoc mirror with one leaf per
source file, folder indexes ≤ 200 lines.

## Routing — when to delegate

This is a large monorepo. Use the right subagent so context stays focused:

- Touching `apps/nakiros/**` (daemon, runners, IPC handlers, services, bundled
  skills) → use **`@backend`**.
- Touching `apps/frontend/**` (React, Tailwind, i18n, screens, hooks, UI) →
  use **`@frontend`**.
- Touching `apps/landing/**` or `packages/shared/**` or pure root config → main
  agent OK. For `packages/shared/**`, see `.claude/rules/ipc-contract.md`.

Each subagent has its own embedded context and persistent memory under
`.claude/agent-memory/<name>/`.

## Universal constraints (every scope)

- **Reuse over duplication.** Before adding a function, helper, hook,
  component, runner, screen, or IPC handler, browse the relevant
  `docs/technical/` index and grep for similar work. 80% identical = reuse +
  parameterise; do **not** copy-paste.
- **Cohérence UX.** New screens for a `.claude/` entity (claudemd, rules,
  subagents, hooks, permissions, mcp, output-styles) MUST mirror the existing
  **Skill** screen (tab structure, audit/fix/eval lifecycle, layout). It is
  the canonical pattern — diverge only with explicit user agreement.
- **Local-first.** No network calls, no telemetry, no secrets in code.
  User-persisted data goes under `~/.nakiros/`.
- **Never edit `dist/`** (generated outputs).
- **Communication**: French with the user; English in code, commits, and PRs.

## Rules — auto-attached by file path

Each `.claude/rules/*.md` declares a `paths:` glob in its frontmatter and is
auto-attached when you edit a matching file. You don't need to remember to
read them — Claude Code surfaces the relevant rule for the file at hand.

| Rule | Auto-attaches when touching |
|------|-----------------------------|
| `.claude/rules/ipc-contract.md` | IPC channels, handlers, `nakiros-client.ts`, `global.d.ts`, shared types |
| `.claude/rules/i18n.md` | Any `.tsx` in `apps/frontend/**` or i18n bundles |
| `.claude/rules/ui-kit.md` | Any component or view in `apps/frontend/src/{components,views}/**` |
| `.claude/rules/token-accounting.md` | session-jsonl/usage helpers, run/viz components, run-display lib |
| `.claude/rules/runners.md` | `apps/nakiros/src/services/*runner*.ts` and `runner-core/**` |
| `.claude/rules/markdown-rendering.md` | `MarkdownViewer.tsx` and screens that render markdown |

## Validation before closing

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
turbo build
```
