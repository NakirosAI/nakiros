# fs.ts

**Path:** `apps/nakiros/src/services/skill-fs/fs.ts`

Low-level filesystem helpers used across the skill-fs module: error-tolerant `readdir` and stat-based directory check (follows symlinks, unlike `Dirent.isDirectory()`).

## Exports

### `function safeReaddir`

`readdirSync(..., { withFileTypes: true })` that returns `[]` on any error instead of throwing. Used everywhere the skill-fs module walks a directory whose existence is uncertain.

```ts
export function safeReaddir(path: string): Dirent[]
```

### `function isDirectoryStat`

True if `path` resolves (following symlinks) to a directory. False on any error. Use this instead of `Dirent.isDirectory()` when the entry may be a symlink — `Dirent.isDirectory()` uses `lstat` and returns false for symlinks, even when they point to a directory.

```ts
export function isDirectoryStat(path: string): boolean
```
