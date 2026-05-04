# hooks-writer

**Path:** `apps/nakiros/src/services/hooks-writer.ts`

Read/write service for the `hooks` block of a project's `.claude/settings.json`. Exposes exactly two public functions: a reader that extracts only the `hooks` key (leaving all other settings untouched) and a merge-writer that replaces only that key with an optimistic-lock conflict check. All other settings keys (permissions, env, model, outputStyle, etc.) are preserved on every write.

## Exports

### `readHooksBlock`

```ts
export function readHooksBlock(projectPath: string): HooksReadResult
```

Read the `hooks` block from the project's `.claude/settings.json`.

Returns only the hooks block as pretty-printed JSON — all other settings keys (permissions, env, model, etc.) are intentionally excluded. When `.claude/settings.json` does not exist or contains no `hooks` key, `content` is `"{}"` so the editor has a valid empty-object baseline.

**Parameters:**
- `projectPath` — absolute path to the project root; `.claude/settings.json` is resolved from here

**Returns:** `HooksReadResult` with fields `content` (pretty-printed JSON of the hooks block), `mtime` (ISO string of the file's last modification time), `exists` (whether settings.json was present), and `path` (absolute path to settings.json).

---

### `saveHooksBlock`

```ts
export function saveHooksBlock(
  projectPath: string,
  hooksJsonString: string,
  mtimeAtRead: string,
): HooksExpertMutationResult
```

Merge a new hooks block into the project's `.claude/settings.json`, preserving every other key (permissions, env, model, outputStyle, etc.).

Optimistic-lock: if the file's current mtime differs from `mtimeAtRead`, the save is aborted with `{ ok: false, code: 'conflict' }`. Pass an empty `mtimeAtRead` to skip the check (safe only on first-ever write when the file didn't exist at read time).

When `hooksJsonString` parses to an empty object `{}` or `null`, the `hooks` key is removed from settings.json rather than written as `{}`.

**Parameters:**
- `projectPath` — absolute path to the project root
- `hooksJsonString` — JSON-stringified hooks block to merge in; `"{}"` or `"null"` removes the key
- `mtimeAtRead` — ISO mtime returned by `readHooksBlock`; pass `""` to skip the lock check

**Returns:** `HooksExpertMutationResult` — `{ ok: true }` on success, or `{ ok: false, code, message }` on conflict / invalid JSON / fs error.
