# output-styles-writer.ts

**Path:** `apps/nakiros/src/services/output-styles-writer.ts`

Raw-content writer for `.claude/output-styles/<name>.md` files. Extracted from `daemon/handlers/output-styles.ts`'s `outputStyles:save` handler so a second call site (the bootstrap dispatch, `bootstrap-dispatch.ts`) can write a style without duplicating path-traversal validation or the mtime-guard logic. The `outputStyles:save` IPC handler now delegates here too — same code, one owner.

## Exports

### `resolveStylePath`

Validate that `styleName` is safe (no `..`, no leading `/`) and that the resolved absolute path stays within `.claude/output-styles/`. Returns the resolved absolute path on success, throws on traversal attempt.

```ts
export function resolveStylePath(projectPath: string, styleName: string): string
```

**Throws:** `Error` — when `styleName` attempts path traversal or escapes `.claude/output-styles/`.

### `writeOutputStyleFile`

Write an output style's full raw content (including its `---` frontmatter block) to `<projectPath>/.claude/output-styles/<styleName>`. Creates parent directories for nested names (e.g. `subdir/explanatory.md`).

Optimistic-lock: when the target already exists and `mtimeAtRead` is a non-empty string, a mismatch against the current on-disk mtime returns `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force an unconditional write (used by the bootstrap dispatcher, which never has a prior read to compare against).

```ts
export function writeOutputStyleFile(
  projectPath: string,
  styleName: string,
  content: string,
  mtimeAtRead: string,
): OutputStylesExpertMutationResult
```
