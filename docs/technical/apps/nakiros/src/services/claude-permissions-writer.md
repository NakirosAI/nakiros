# claude-permissions-writer

**Path:** `apps/nakiros/src/services/claude-permissions-writer.ts`

Read / save service for the permissions block of `.claude/settings.json` and `.claude/settings.local.json` (Module 4 V2). Surfaces `allow`, `deny`, `ask`, and `defaultMode` as structured fields. All other top-level keys are split into two round-trip blobs: `rest` (shown to users as editable raw JSON) and `preservedJson` (keys owned by other tabs — hooks, outputStyle, mcpServers — silently merged back at save). Atomic writes with mtime optimistic-lock conflict detection.

## Exports

### `readPermissions`

```ts
export function readPermissions(
  projectPath: string,
  scope: PermissionsScope,
): PermissionsFileContent
```

Read the permissions block from `.claude/settings.json` or `.claude/settings.local.json` for the structured editor.

Surfaces `allow`, `deny`, `ask`, and `defaultMode` as dedicated fields. All other top-level keys are split into two round-trip blobs: `rest` (shown to the user) and `preservedJson` (hooks, outputStyle, mcpServers silently merged back at save). Returns an empty `PermissionsFileContent` (exists: false) when the file is absent or unreadable.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `scope` — `'project'` for `settings.json`, `'local'` for `settings.local.json`.

---

### `savePermissions`

```ts
export function savePermissions(
  projectPath: string,
  request: SavePermissionsRequest,
): PermissionsMutationResult
```

Persist the editor's permissions values back to `.claude/settings[.local].json`.

Re-assembles the final object by merging `restObj` (user-edited raw JSON), `preservedObj` (hooks, outputStyle, mcpServers round-tripped unchanged), and the structured `permissions` block. The `rest` field is validated as a JSON object before writing — returns `code: 'invalid-rest-json'` if malformed. Applies an mtime guard: returns `code: 'conflict'` if the file changed since `mtimeAtRead`. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Structured permissions values + round-trip blobs + mtime lock.
