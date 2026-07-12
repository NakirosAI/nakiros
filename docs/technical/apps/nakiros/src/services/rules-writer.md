# rules-writer.ts

**Path:** `apps/nakiros/src/services/rules-writer.ts`

Raw-content writer for `.claude/rules/<name>.md` files. Extracted from `daemon/handlers/rules.ts`'s `rules:save` handler so a second call site (the bootstrap dispatch, `bootstrap-dispatch.ts`) can write a rule without duplicating path-traversal validation or the mtime-guard logic. The `rules:save` IPC handler now delegates here too — same code, one owner.

## Exports

### `resolveRulePath`

Validate that `ruleName` is safe (no `..`, no leading `/`) and that the resolved absolute path stays within `.claude/rules/`. Returns the resolved absolute path on success, throws on traversal attempt.

```ts
export function resolveRulePath(projectPath: string, ruleName: string): string
```

**Throws:** `Error` — when `ruleName` attempts path traversal or escapes `.claude/rules/`.

### `writeRuleFile`

Write a rule's full raw content (including its `---` frontmatter block) to `<projectPath>/.claude/rules/<ruleName>`. Creates parent directories for nested rule names (e.g. `frontend/styling.md`).

Optimistic-lock: when the target already exists and `mtimeAtRead` is a non-empty string, a mismatch against the current on-disk mtime returns `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force an unconditional write (used by the bootstrap dispatcher, which never has a prior read to compare against).

```ts
export function writeRuleFile(
  projectPath: string,
  ruleName: string,
  content: string,
  mtimeAtRead: string,
): RulesMutationResult
```
