---
name: code-documentation
description: "Generate and maintain TSDoc on exported symbols across the Nakiros monorepo AND a mirrored Markdown documentation tree under docs/technical/. Indexes stay ≤ 200 lines and point to leaf files that reproduce the inline docs. Use when the user or an agent asks to document new or changed code, fill in missing TSDoc on exports, refresh the technical docs after a change, or do a full rattrapage of undocumented files. Triggers: '/code-documentation', 'documente', 'génère la doc', 'mets à jour la documentation technique', 'doc des agents', 'TSDoc'."
user-invocable: true
disable-model-invocation: false
---

# Code Documentation — Nakiros

Two-layer documentation generator for the Nakiros monorepo:

1. **Inline TSDoc** on every exported symbol in TypeScript source files (`export function`, `export class`, `export const`, `export type`, `export interface`, default exports).
2. **Mirrored Markdown tree** under `docs/technical/` that mirrors the source layout, with folder indexes (`README.md`) ≤ 200 lines that link to per-file leaf docs reproducing the inline TSDoc.

**IMPORTANT: Always speak French with the user. Only these instructions are in English.**

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command | User chat: `/code-documentation`, `/code-documentation [path]`, `/code-documentation --full` | Always |
| Manifest | `docs/technical/.manifest.json` | Every run |
| Diff report | `node scripts/compute-diff.mjs` output (JSON) | Every run |
| Source files | `apps/**/src/**/*.{ts,tsx}`, `packages/**/src/**/*.{ts,tsx}` (minus excludes) | Every run |
| Existing leaf docs | `docs/technical/**/*.md` | When updating |
| User excludes | `docs/technical/.ignore` (one regex per line, optional) | If present |

### Excluded from documentation (hard-coded in `scripts/compute-diff.mjs`)
- `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`
- `**/dist/**`, `**/node_modules/**`, `**/generated/**`
- `**/*.d.ts` (generated declaration files)

## Outputs

| Command | Files produced / modified | Chat output |
|---------|--------------------------|-------------|
| `/code-documentation` (diff mode, default) | TSDoc added to changed source files + mirrored `.md` leaves + updated parent `README.md` indexes + updated `.manifest.json` | Short summary: N source files documented, M indexes refreshed, K leaves deleted |
| `/code-documentation [path]` | Same, scoped to `[path]` | Same, scoped |
| `/code-documentation --full` | TSDoc added to every undocumented export + full mirror rebuild | Per-package progress + final totals |

## Example flow

```
Input:  "/code-documentation apps/nakiros/src/daemon/handlers"
Reads:  docs/technical/.manifest.json
        3 source files flagged as modified by compute-diff.mjs
        docs/technical/apps/nakiros/src/daemon/handlers/*.md (if present)
Writes: TSDoc blocks inside those 3 source files
        docs/technical/apps/nakiros/src/daemon/handlers/skills.md
        docs/technical/apps/nakiros/src/daemon/handlers/audit.md
        docs/technical/apps/nakiros/src/daemon/handlers/fix.md
        docs/technical/apps/nakiros/src/daemon/handlers/README.md (index refreshed)
        docs/technical/.manifest.json (new hashes for those 3 files)
Chat:   "3 fichiers documentés, 1 index mis à jour."
```

## Context loading — do this EVERY time

1. Check `docs/technical/.manifest.json` exists. If not → first run, treat as full mode.
2. Read `references/markdown-structure.md` — mirror layout rules, 200-line index limit, splitting strategy, leaf format.
3. Read `references/jsdoc-conventions.md` — TSDoc format, what to document, what to skip, language rule.
4. Run `node scripts/compute-diff.mjs [--scope <path>] [--full]`. Parse the JSON it prints on stdout.
5. Read `templates/leaf.md` and `templates/index.md` before writing any markdown.

## Workflow

### On `/code-documentation` (default — diff mode)

1. Run `node scripts/compute-diff.mjs` from the repo root. Parse `{added, modified, deleted, unchanged_count, total}`.
2. If `added` and `modified` and `deleted` are all empty → stop, tell the user **"Aucun changement détecté."** Do not run the manifest update.
3. For each file `F` in `added` ∪ `modified`:
   1. Read `F` fully.
   2. Identify every exported symbol. Rules in `references/jsdoc-conventions.md` § "What counts as an export".
   3. For every exported symbol WITHOUT a TSDoc block immediately above it → add a TSDoc block following the template in `references/jsdoc-conventions.md`.
   4. For every exported symbol WITH existing TSDoc → keep the human-written prose. If the signature changed, sync `@param` / `@returns` lines only; do not rewrite the description.
   5. Write/overwrite the mirror leaf at `docs/technical/{F with extension replaced by .md}` using `templates/leaf.md`. The leaf reproduces the TSDoc of every exported symbol — nothing more, nothing less.
4. For each file `F` in `deleted`:
   1. Delete `docs/technical/{mirror path}.md` if it exists.
   2. Mark the parent folder index as needing refresh.
5. Refresh every parent `README.md` index on the path from each touched file up to `docs/technical/README.md`:
   - Use `templates/index.md`.
   - One entry per direct child (file or subfolder).
   - One-line description per entry (extract from the leaf's first paragraph or the folder's own purpose line).
   - If an index would exceed 200 lines → split per `references/markdown-structure.md` § "Splitting large indexes".
6. Build the payload `{"updated": [...all F in added ∪ modified...], "deleted": [...all F in deleted...]}` and pipe it into `node scripts/update-manifest.mjs`. The script re-hashes `updated` and removes `deleted` from the manifest.
7. Report in chat (French, ≤ 3 lines): count of source files documented, indexes refreshed, leaves deleted.

### On `/code-documentation [path]`

Same workflow, but pass `--scope [path]` to `compute-diff.mjs`. Normalize `[path]` to be relative to the repo root (e.g. `apps/nakiros/src/daemon`). If the scope is absolute, convert it; if it does not start with `apps/` or `packages/`, tell the user it's out of scope and stop.

### On `/code-documentation --full` (rattrapage)

1. Run `node scripts/compute-diff.mjs --full`. Every tracked source file is returned in `modified`.
2. Process per-package, not per-file, to keep progress visible: loop `apps/nakiros`, `apps/frontend`, `apps/landing`, `packages/shared`, `packages/agents-bundle` in that order. Within each package, do steps 3–5 of the default workflow.
3. At the end of each package, print one progress line in chat: `"apps/nakiros — 42 fichiers documentés"`.
4. Commit all hashes at once at the end via `update-manifest.mjs`.

## Gotchas

- **Do NOT invent exports.** Only document symbols with the `export` keyword, or the file's default export. Internal helpers (module-local consts, non-exported types) stay undocumented in both source and leaf.
- **Do NOT restate the type signature in prose.** `function add(a: number, b: number): number` does not need `"adds two numbers"`. Describe *purpose*, *side effects*, *project-specific context* — not what TypeScript already says.
- **Respect existing TSDoc prose.** When you detect existing TSDoc above an exported symbol, keep the human-written description as-is. Only sync `@param` / `@returns` / `@throws` tags if the signature changed.
- **Language of TSDoc in source.** If the file already contains TSDoc in French, keep writing French. If English, keep English. For files with no prior TSDoc, default to **English** — it matches the bulk of the Nakiros source and the convention for code-level comments.
- **Language of Markdown leaves and indexes.** Always **English** (the doc is for agents first; English performs better).
- **Components (`.tsx`).** Document the exported component AND its `Props` interface (or type alias). Component TSDoc states the role and when to use it; Props TSDoc documents each prop.
- **IPC handlers are special.** For any file under `apps/nakiros/src/daemon/handlers/`, the leaf doc MUST list the IPC channel name(s) the handler registers (e.g. `skills:list`, `audit:start`). Agents reading the doc need this to reach the handler.
- **Mirror path rule.** `apps/nakiros/src/foo/bar.ts` → `docs/technical/apps/nakiros/src/foo/bar.md`. The folder index is always `{folder}/README.md`. No other naming, no flattening.
- **Index line budget: 200 lines max.** When an index would exceed 200 lines → split per `references/markdown-structure.md`. Never silently let an index grow past the limit.
- **Deletion cleanup.** When a source file is deleted, you MUST delete its leaf AND remove its entry from the parent index. An orphan entry breaks navigation for the next agent.
- **Never `git add` anything.** The skill produces files; the user commits them. No `git` commands invoked from the workflow.
- **Manifest is authoritative.** Never mutate `.manifest.json` by hand — only through `update-manifest.mjs`. If it's corrupted, delete it and run `--full`.
- **Excluded file explicitly requested.** If the user asks to document a file that matches an exclude rule (e.g. a `.test.ts`), tell them why and stop — don't silently skip.
- **Large files (> 1000 lines).** Don't try to read them in one shot. Read in chunks, document export-by-export, write the leaf at the end. The leaf itself may exceed 200 lines — only **indexes** have the 200-line cap.
- **No mocks, no guesses.** If you can't parse a symbol's signature clearly (e.g. generics with constraints, overloaded functions), write `// TODO: review TSDoc — signature ambiguous` as the description and flag the file in the final chat report. Never hallucinate types or purposes.
- **ASK when unsure.** If the user's command is ambiguous (e.g. they point to a path that doesn't exist, or they want to document something outside `apps/` and `packages/`), ask before running — do not guess scope.

## Available commands

- **`/code-documentation`** → Diff mode: document every source file that changed since the last run (default).
- **`/code-documentation [path]`** → Diff mode scoped to a subtree (path must be under `apps/` or `packages/`).
- **`/code-documentation --full`** → Rattrapage: document every tracked source file, ignoring the manifest. Use on first run or after manifest corruption.
