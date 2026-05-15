# claude-hooks-writer

**Path:** `apps/nakiros/src/services/claude-hooks-writer.ts`

Read / save service for the `hooks` block of `.claude/settings.json` (or `.claude/settings.local.json`). Edits only the `hooks` slice; every other key is round-tripped via an opaque `preservedJson` blob so concurrent ownership with the Permissions tab is safe. Atomic writes (write-to-tmp then rename) with mtime optimistic-lock conflict detection. Flattens the Claude Code matcher-group structure into one editor row per `(matcher × command)` tuple, and re-nests at save time.

## Exports

### `readHooks`

```ts
export function readHooks(
  projectPath: string,
  scope: PermissionsScope,
): HooksFileContent
```

Read the hooks block from `.claude/settings.json` or `.claude/settings.local.json` and return a flat editor-friendly representation.

Returns a zero-filled `HooksFileContent` (exists: false, empty events) when the file is absent, unreadable, or contains invalid JSON.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `scope` — `'project'` for `settings.json`, `'local'` for `settings.local.json`.

**Returns:** Structured `HooksFileContent` with one `HookEditEvent` entry per supported hook event.

---

### `saveHooks`

```ts
export function saveHooks(
  projectPath: string,
  request: SaveHooksRequest,
): HooksMutationResult
```

Persist a modified hooks configuration back to `.claude/settings[.local].json`.

Merges the structured hooks block with the opaque `preservedJson` blob that was round-tripped from the last `readHooks` call, so keys owned by other tabs (permissions, model, env, mcpServers, outputStyle…) are never disturbed. Uses an mtime guard: if the file changed on disk since `mtimeAtRead`, returns `code: 'conflict'` instead of overwriting. The write itself is atomic (write-to-tmp then rename).

An empty hooks event list for a given event is omitted from the output rather than stored as an empty array. When all events are empty the `hooks` key is removed from the file entirely.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Structured hooks + metadata produced by the editor.

**Returns:** `HooksMutationResult` — `{ ok: true, file }` on success, or `{ ok: false, code, message, currentMtime? }` on conflict / write failure.
