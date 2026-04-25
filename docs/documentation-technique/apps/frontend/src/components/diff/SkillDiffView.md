# SkillDiffView.tsx

**Path:** `apps/frontend/src/components/diff/SkillDiffView.tsx`

Reusable side-by-side file diff with a left-hand file list. Used by `FixReviewPanel` (fix runs) and the create-review flow. Lazy-loads each file's content via the caller-supplied `fetchDiff` and memoises results in a module-level cache keyed by `cacheScope::relativePath`. Sidebar items show added/removed line counts as soon as their diff is fetched, so the user sees magnitude before opening each file.

## Exports

### `interface SkillDiffFileEntry`

One file entry shown in the left-hand sidebar of the diff view.

```ts
export interface SkillDiffFileEntry {
  relativePath: string;
  /** True if the file has content on the "original" side (before). */
  inOriginal: boolean;
  /** True if the file has content on the "modified" side (after). */
  inModified: boolean;
}
```

### `interface SkillDiffFileContent`

Content of a single file on both sides of the diff, returned by the caller-supplied fetcher.

```ts
export interface SkillDiffFileContent {
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}
```

### `interface SkillDiffLabels`

All user-facing strings rendered by `SkillDiffView`. Populated by callers from i18n.

```ts
export interface SkillDiffLabels {
  filesPanelTitle: string;
  originalColumn: string;
  modifiedColumn: string;
  missingFile: string;
  binaryNotice: string;
  identicalNotice: string;
  loading: string;
  errorTemplate: (message: string) => string;
  emptyState: string;
  sideOriginalOnly: string;
  sideModifiedOnly: string;
  sideBoth: string;
  addedLinesLabel: (count: number) => string;
  removedLinesLabel: (count: number) => string;
}
```

### `SkillDiffView` (default export)

```ts
export default function SkillDiffView(props: { files; fetchDiff; labels; headerSlot?; cacheScope }): JSX.Element
```

Top-level diff component. Composes a sidebar (`FileSidebar`) and a diff panel (`DiffPanel`) in a flex row. `headerSlot` lets callers prepend full-width content above the split (e.g. action buttons).

### `invalidateSkillDiffCache`

```ts
export function invalidateSkillDiffCache(cacheScope: string): void
```

Drops every cached + in-flight diff entry whose key starts with `${cacheScope}::`. Call this when the underlying files change so the diff view re-fetches on next mount (e.g. after a new agent turn in a fix run).
