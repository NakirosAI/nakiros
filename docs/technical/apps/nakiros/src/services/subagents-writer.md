# subagents-writer.ts

**Path:** `apps/nakiros/src/services/subagents-writer.ts`

Raw-content writer for `.claude/agents/<name>.md` files. Extracted from `daemon/handlers/subagents.ts`'s `subagents:save` handler so a second call site (the bootstrap dispatch, `bootstrap-dispatch.ts`) can write a subagent without duplicating path-traversal validation or the mtime-guard logic. The `subagents:save` IPC handler now delegates here too — same code, one owner.

## Exports

### `resolveSubagentPath`

Validate that `subagentName` is safe (no `..`, no leading `/`) and that the resolved absolute path stays within `.claude/agents/`. Returns the resolved absolute path on success, throws on traversal attempt.

```ts
export function resolveSubagentPath(projectPath: string, subagentName: string): string
```

**Throws:** `Error` — when `subagentName` attempts path traversal or escapes `.claude/agents/`.

### `writeSubagentFile`

Write a subagent's full raw content (including its `---` frontmatter block) to `<projectPath>/.claude/agents/<subagentName>`. Creates parent directories for nested names (e.g. `team/reviewer.md`).

Optimistic-lock: when the target already exists and `mtimeAtRead` is a non-empty string, a mismatch against the current on-disk mtime returns `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force an unconditional write (used by the bootstrap dispatcher, which never has a prior read to compare against).

```ts
export function writeSubagentFile(
  projectPath: string,
  subagentName: string,
  content: string,
  mtimeAtRead: string,
): SubagentsMutationResult
```
