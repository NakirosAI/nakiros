# scan.ts

**Path:** `apps/nakiros/src/services/skill-fs/scan.ts`

Recursive scan of a skill directory tree, returning the canonical `SkillFileEntry[]` shape consumed by every UI file tree. Centralises the `evals/workspace/` hide rule and the directories-first sort order.

## Exports

### `const HIDDEN_PATHS`

Relative paths (from the skill root) that are never returned by `scanSkillDirectory`. `evals/workspace` is the eval sandbox — noisy and uninteresting to display.

```ts
export const HIDDEN_PATHS: ReadonlySet<string>
```

### `function isHiddenPath`

True if `relativePath` (or any of its descendants) is under `HIDDEN_PATHS`.

```ts
export function isHiddenPath(relativePath: string): boolean
```

### `function scanSkillDirectory`

Recursively scan a skill directory and return its tree as `SkillFileEntry[]`. Hidden paths (see `HIDDEN_PATHS`) are skipped. Output is sorted with directories first, then files, both alphabetical. File `sizeBytes` is best-effort — unreadable files report `0`.

```ts
export function scanSkillDirectory(dirPath: string, basePath: string): SkillFileEntry[]
```

**Parameters:**
- `dirPath` — current directory being walked (changes during recursion).
- `basePath` — skill root used to compute `relativePath`. Stays constant across the recursion.

**Returns:** the tree of entries, with `children` populated for directories.
