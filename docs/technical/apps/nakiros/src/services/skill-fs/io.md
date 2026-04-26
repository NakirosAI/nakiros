# io.ts

**Path:** `apps/nakiros/src/services/skill-fs/io.ts`

Path-traversal-safe file IO for skill directories. Every reader's `read*File` / `save*File` delegates here — the path validation rule lives once.

## Exports

### `function validateSkillFilePath`

Resolve `relativePath` against `skillDir` and return the absolute path only if it stays within `skillDir`. Returns `null` on path-traversal attempts (e.g. `relativePath = '../../etc/passwd'`).

```ts
export function validateSkillFilePath(skillDir: string, relativePath: string): string | null
```

**Returns:** the validated absolute path, or `null` when the resolved path escapes `skillDir`.

### `function readSkillFileSafe`

Read a file inside a skill directory by relative path. Returns `null` on path-traversal, missing file, or read error.

```ts
export function readSkillFileSafe(skillDir: string, relativePath: string): string | null
```

### `function writeSkillFileSafe`

Write a file inside a skill directory by relative path. Path-traversal attempts are silently ignored (returns without writing).

```ts
export function writeSkillFileSafe(skillDir: string, relativePath: string, content: string): void
```
