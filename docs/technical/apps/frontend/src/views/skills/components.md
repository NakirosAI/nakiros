# components.tsx

**Path:** `apps/frontend/src/views/skills/components.tsx`

UI primitives shared across every scoped skills view: pass-rate badge,
neutral pill, segmented tab button, recursive file/folder tree, and a
handful of formatters.

## Exports

### `PassRateBadge`

```ts
function PassRateBadge(props: { rate: number; size?: 'sm' | 'md' }): JSX.Element;
```

Coloured pill rendering an eval pass rate (`0`–`1`): green ≥ 80%, amber
≥ 50%, red below.

### `Badge`

```ts
function Badge(props: { label: string }): JSX.Element;
```

Small neutral pill for short labels (counts, categories).

### `TabButton`

```ts
function TabButton(props: {
  active: boolean;
  onClick(): void;
  disabled?: boolean;
  children: React.ReactNode;
}): JSX.Element;
```

Segmented-control button used in the skill detail view (Files / Evals /
Audits).

### `FileTree`

```ts
function FileTree(props: {
  entries: SkillFileEntry[];
  selectedPath: string | null;
  onSelect(path: string): void;
  depth?: number;
}): JSX.Element;
```

Recursive file/folder tree. Leaves invoke `onSelect(relativePath)`;
folders toggle expand/collapse locally. Depth-0 folders render expanded.

### `countFiles`

```ts
function countFiles(entries: SkillFileEntry[]): number;
```

Recursively counts non-directory entries inside a tree.

### `formatSize`

```ts
function formatSize(bytes: number): string;
```

Human-readable file size: `999B`, `12.3K`, `4.5M` (binary divisions).

### `formatTokens`

```ts
function formatTokens(n: number): string;
```

Compact token count: `820 tok` under 1k, `1.2k tok` above.

### `formatDuration`

```ts
function formatDuration(ms: number): string;
```

Compact duration: `420ms`, `12.3s`, `1m05s`.

### `EvalModelSelector`

```ts
function EvalModelSelector(props: {
  value: ClaudeModelId;
  onChange(value: ClaudeModelId): void;
  disabled?: boolean;
  label: string;
  title?: string;
}): JSX.Element;
```

Inline `<select>` for the Claude model used to run evals. Rendered next
to the baseline checkbox so the run-eval bar stays single-line.
