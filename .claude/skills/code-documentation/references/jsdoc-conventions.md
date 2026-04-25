# TSDoc conventions — Nakiros

This document defines the TSDoc format the `code-documentation` skill writes into source files.

## What counts as an export

Document:
- `export function foo(...)`
- `export class Foo`
- `export interface Foo`
- `export type Foo = ...`
- `export const foo = ...` (including arrow-function consts and React components)
- `export default ...` (function, class, or expression)
- `export { foo, bar }` re-exports — **document the symbol at its original definition**, not at the re-export. If a file only re-exports, the leaf simply lists the re-exports with links to their source leaf.

Do NOT document:
- Internal (non-exported) functions, classes, consts, types.
- Local helpers scoped to a single exported function.
- Anonymous IIFE side effects.
- Imports, module-level statements.

## TSDoc block template

```ts
/**
 * <One-line purpose — what this symbol does in the project's context.>
 *
 * <Optional second paragraph: side effects, invariants, when to use, when NOT to use.>
 *
 * @param <name> - <what it represents, not just its type>
 * @param <name> - <…>
 * @returns <what the caller receives and under which conditions>
 * @throws <ErrorType> <when this error is thrown>
 * @example
 * ```ts
 * const x = foo(...)
 * ```
 */
```

- The first line is the **purpose** of the symbol. Keep it under 100 characters if possible.
- `@param` is only useful when the name or type does not already convey the meaning. Skip when the type is self-explanatory (e.g. `@param id - the user id` for `id: string` adds nothing).
- `@returns` is only useful when the return type does not speak for itself, OR when the function has a conditional return (e.g. returns `null` on missing data).
- `@throws` when the function can throw in the normal flow (not language-level errors like TypeError).
- `@example` only for non-obvious APIs or for the public surface of a package.

## What to write in the description

Write what the **agent or developer needs to know that the signature does not say**:
- Side effects (writes a file, mutates a global, broadcasts an event…)
- Preconditions and invariants
- Project-specific context (IPC channel involved, runner it belongs to, event it broadcasts, storage path it touches)
- When to use this symbol vs a sibling

Do NOT write:
- A restatement of the signature.
- Tutorials on TypeScript / React / Node.
- References to issue numbers or PRs (those belong in git).

## Language rule

- **If the file already contains TSDoc in French**, keep writing French. Do not translate existing French docs to English.
- **If the file already contains TSDoc in English**, keep writing English.
- **If the file has no prior TSDoc**, default to **English** (matches the convention across the Nakiros TypeScript source).

Apply this rule per-file, not per-project. Some files may be French-documented for historical reasons; don't touch them.

## Component (.tsx) convention

```tsx
/**
 * Sidebar navigation for the dashboard project view. Renders tabs for
 * ProjectOverview, SkillsView, ConversationsView, RecommendationsView.
 *
 * Reads the active tab from `useDashboardTab()`; dispatches tab changes
 * through the same hook. No local state.
 */
export function DashboardSidebar(props: DashboardSidebarProps) { … }

/**
 * Props for {@link DashboardSidebar}.
 */
export interface DashboardSidebarProps {
  /** Currently selected project id. */
  projectId: string
  /** Called when the user clicks a tab. Receives the tab key. */
  onTabChange: (tab: DashboardTab) => void
}
```

- Component TSDoc states the role AND its place in the UI tree when useful.
- Props interface documents each prop individually with inline `/** … */`.
- If props have a default value, mention it: `/** Default: 'expanded'. */`.

## IPC handler convention

For files under `apps/nakiros/src/daemon/handlers/*.ts`:

```ts
/**
 * Registers the skills:* IPC channels on the shared handler registry.
 *
 * Channels:
 * - `skills:list` — returns [{ name, path }] for all skills under ~/.nakiros/skills
 * - `skills:read` — returns the SKILL.md content of a named skill
 * - `skills:write` — overwrites SKILL.md and bumps the skill's updated_at
 *
 * Broadcasts `skills:changed` on every write via eventBus.broadcast.
 */
export function registerSkillsHandlers(registry: HandlerRegistry) { … }
```

The leaf markdown for this file MUST surface the channel list in a dedicated section (see `templates/leaf.md`).

## Signature-sync rule (updating existing TSDoc)

When a modified file has existing TSDoc whose signature no longer matches:

- Keep the description unchanged.
- Re-emit `@param` lines for the current parameters only. Remove `@param` for parameters that no longer exist. Add `@param` for new parameters with `<name> - TODO: describe` so the user fills it in.
- Re-emit `@returns` if the return type changed meaningfully (e.g. `void` → `Promise<Foo>` requires an updated `@returns`).
- If you had to add a `TODO: describe`, include the file in the final chat report under a "Revues manuelles requises" section.

## Examples

### Good

```ts
/**
 * Resolves the temp workdir path for a fix/create/eval run and creates it
 * if missing. Never deletes an existing workdir.
 *
 * @param runId - uuid assigned by the runner at start
 * @returns absolute path under ~/.nakiros/tmp-skills/
 */
export function ensureTempWorkdir(runId: string): string { … }
```

### Bad (restates the signature)

```ts
/**
 * Takes a string runId and returns a string path.
 *
 * @param runId - the run id string
 * @returns a string
 */
```

### Bad (invents context)

```ts
/**
 * Creates a directory. Added in v0.3.2 to fix issue #42.
 */
```
