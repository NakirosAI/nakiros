# claude-output-styles-writer

**Path:** `apps/nakiros/src/services/claude-output-styles-writer.ts`

Write service for the `.claude/output-styles/` directory (Module 3 V2). Follows the same patterns as `claude-rules-writer` and `claude-agents-writer`: mtime optimistic-lock, atomic rename, name validation against `[a-z0-9][a-z0-9-]*`. The frontmatter shape is minimal — only `description` and `keep-coding-instructions` are editable. Built-in styles (Default, Explanatory, Learning) are never stored on disk and are not touched by this writer.

## Exports

### `listOutputStyles`

```ts
export function listOutputStyles(projectPath: string): OutputStylesListResult
```

List custom output styles from `.claude/output-styles/` and report which style is currently selected for the project.

The active selection is read from `settings.local.json` first, then `settings.json`. Returns `activeSource: 'none'` when neither sets it. Built-in styles (Default, Explanatory, Learning) are not on disk and are not listed; they only appear when referenced as `activeName`.

**Parameters:**
- `projectPath` — Absolute path to the project root.

---

### `readOutputStyleForEditor`

```ts
export function readOutputStyleForEditor(
  projectPath: string,
  name: string,
): OutputStyleFileContent | null
```

Read a single output style file for the editor.

Parses the YAML frontmatter into structured fields (`description`, `keepCodingInstructions`) and returns the markdown body separately. Returns `null` when the name is invalid or the file does not exist.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `name` — Slug matching `[a-z0-9][a-z0-9-]*` (file: `.claude/output-styles/<name>.md`).

---

### `createOutputStyle`

```ts
export function createOutputStyle(
  projectPath: string,
  request: CreateOutputStyleRequest,
): OutputStyleMutationResult
```

Create a new output style file at `.claude/output-styles/<name>.md` with a starter frontmatter and body.

Fails with `code: 'invalid-name'` if the slug does not match the pattern, or `code: 'already-exists'` if a file with that name is already present. Creates parent directories as needed. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Desired slug and optional initial description.

---

### `saveOutputStyle`

```ts
export function saveOutputStyle(
  projectPath: string,
  request: SaveOutputStyleRequest,
): OutputStyleMutationResult
```

Overwrite an existing output style with the editor's current values.

Applies an mtime optimistic-lock guard. Returns `code: 'conflict'` if the file changed on disk since the last read, `code: 'not-found'` if the file no longer exists. Serializes frontmatter (`description`, `keep-coding-instructions`) and body back to the canonical YAML + markdown format. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Updated fields + mtime captured at the last read.

---

### `deleteOutputStyle`

```ts
export function deleteOutputStyle(projectPath: string, name: string): OutputStyleMutationResult
```

Delete an output style file from `.claude/output-styles/<name>.md`.

Returns `code: 'not-found'` if the file does not exist. No mtime guard — the caller has confirmed via the UI before deletion.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `name` — Slug of the style to delete.
