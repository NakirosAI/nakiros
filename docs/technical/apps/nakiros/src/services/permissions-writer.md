# permissions-writer

**Path:** `apps/nakiros/src/services/permissions-writer.ts`

Low-level read/write helpers for the `permissions` block of `.claude/settings.json` (or `settings.local.json`). Handles scope resolution, optimistic-lock conflict detection, and key-preserving merge so that all other settings keys (hooks, env, model, etc.) are never disturbed. Used by the `permissions:*` IPC handlers.

Note: this is the **permissions expert** I/O service (wired to `permissions:*` IPC). It is distinct from `claude-permissions-writer.ts`, which handles the Module 4 V2 editor and splits foreign keys into `rest`/`preservedJson` blobs.

## Exports

### `readPermissionsBlock`

```ts
export function readPermissionsBlock(
  projectPath: string,
  scope: PermissionsExpertScope,
): PermissionsReadResult
```

Read the `permissions` block from the project's settings file for `scope` (`settings.json` for `'project'`, `settings.local.json` for `'local'`).

Returns only the permissions block as pretty-printed JSON — all other settings keys are intentionally excluded. When the target file is absent or contains no `permissions` key, `content` is `"{}"` so the editor has a valid empty-object baseline. `exists` reflects whether the file was present on disk.

**Parameters:**
- `projectPath` — absolute path to the project root
- `scope` — `'project'` or `'local'`

**Returns:** `PermissionsReadResult` with `content`, `mtime`, `exists`, and `path` fields.

---

### `savePermissionsBlock`

```ts
export function savePermissionsBlock(
  projectPath: string,
  scope: PermissionsExpertScope,
  permissionsJsonString: string,
  mtimeAtRead: string,
): PermissionsExpertMutationResult
```

Merge a new permissions block into the project's settings file for `scope`, preserving every other key. Writes `settings.json` or `settings.local.json` under `<projectPath>/.claude/`; creates the file if it does not exist.

Optimistic-lock: if the file's current mtime differs from `mtimeAtRead`, returns `{ ok: false, code: 'conflict' }`. Pass an empty string for `mtimeAtRead` to skip the check (safe on first-ever write when the file didn't exist at read time).

When `permissionsJsonString` parses to `{}` or `null`, the `permissions` key is removed from the file rather than written as an empty object.

**Parameters:**
- `projectPath` — absolute path to the project root
- `scope` — `'project'` or `'local'`
- `permissionsJsonString` — JSON string of the permissions block to persist
- `mtimeAtRead` — mtime ISO string captured at read time; pass `''` to bypass the lock

**Returns:** `{ ok: true }` on success, or `{ ok: false, code, message }` on conflict, invalid JSON, or filesystem error.
