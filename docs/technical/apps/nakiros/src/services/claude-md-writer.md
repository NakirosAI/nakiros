# claude-md-writer

**Path:** `apps/nakiros/src/services/claude-md-writer.ts`

Read / save / delete service for the project-root `CLAUDE.md`. Each save is atomic (write-to-tmp then rename) with an mtime optimistic-lock guard to detect external modifications. Reads also extract editor sidebar metadata: line count, approximate token cost, top-level headings, `@<path>` imports, and HTML-comment presence. Only the root `CLAUDE.md` is supported — the multi-scope variants that existed in earlier versions have been removed.

## Exports

### `listClaudeMd`

```ts
export function listClaudeMd(projectPath: string): ClaudeMdListResult
```

Return a summary of the project's root `CLAUDE.md` plus a flag indicating whether an `AGENTS.md` is also present at the project root.

Does not read the full file body — use `readClaudeMd` for editing.

**Parameters:**
- `projectPath` — Absolute path to the project root.

---

### `readClaudeMd`

```ts
export function readClaudeMd(projectPath: string): ClaudeMdFileContent | null
```

Read the full content of the project's root `CLAUDE.md` for the editor.

Returns an empty-body `ClaudeMdFileContent` (exists: false) when the file is absent. Returns `null` only on an unexpected read error.

**Parameters:**
- `projectPath` — Absolute path to the project root.

---

### `saveClaudeMd`

```ts
export function saveClaudeMd(
  projectPath: string,
  request: SaveClaudeMdRequest,
): ClaudeMdMutationResult
```

Write the editor's body back to `CLAUDE.md` with an mtime optimistic-lock guard and an atomic rename.

Returns `code: 'conflict'` if the file changed on disk between the last `readClaudeMd` and this save. Creates the file (and parent dirs) if absent. On success, re-reads the saved file and returns the fresh metadata.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — New body content + mtime captured at the last read.

---

### `deleteClaudeMd`

```ts
export function deleteClaudeMd(projectPath: string): ClaudeMdMutationResult
```

Delete the project's root `CLAUDE.md`.

Returns `code: 'not-found'` if the file does not exist. On success, returns an empty-body `ClaudeMdFileContent` so the UI can update without an extra read round-trip.

**Parameters:**
- `projectPath` — Absolute path to the project root.
