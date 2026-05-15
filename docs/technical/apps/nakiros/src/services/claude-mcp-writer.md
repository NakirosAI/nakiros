# claude-mcp-writer

**Path:** `apps/nakiros/src/services/claude-mcp-writer.ts`

Write service for the `.mcp.json` project-root file (Module 5 V2). Operations are per-server (list / read / create / save / delete) but the file is always rewritten as a whole with a top-level mtime guard to detect concurrent edits across server entries. Unknown keys (`headers`, extra config) are preserved via opaque JSON blobs (`headersJson`, `restJson`). All writes are atomic (write-to-tmp then rename). Not to be confused with `mcp-writer.ts` which writes the entire file from scratch.

## Exports

### `readMcpServerForEditor`

```ts
export function readMcpServerForEditor(
  projectPath: string,
  serverName: string,
): McpServerForEditor | null
```

Build an editor view of a single server from `.mcp.json`.

Returns `null` when the server name is invalid, the file cannot be parsed, or the named server does not exist in `mcpServers`.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `serverName` — Key in `mcpServers`; must match `[A-Za-z0-9][A-Za-z0-9_-]*`.

**Returns:** Structured editor view, or `null` if not found.

---

### `emptyServerForEditor`

```ts
export function emptyServerForEditor(
  projectPath: string,
  request: CreateMcpServerRequest,
): McpServerForEditor
```

Build a fresh editor view for a brand-new server (used by the create flow before the server is on disk).

Reads the current `.mcp.json` mtime so the subsequent `createMcpServer` can apply the mtime guard against concurrent edits on other servers.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Initial field values for the new server.

---

### `createMcpServer`

```ts
export function createMcpServer(
  projectPath: string,
  request: CreateMcpServerRequest,
): McpMutationResult
```

Add a new entry to `.mcp.json` under `mcpServers.<name>`.

Fails with `code: 'invalid-name'` if the name does not match the pattern, or `code: 'already-exists'` if a server with that name is already present. Creates `.mcp.json` if it does not exist yet. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Server name, transport, and initial config values.

---

### `saveMcpServer`

```ts
export function saveMcpServer(
  projectPath: string,
  request: SaveMcpServerRequest,
): McpMutationResult
```

Overwrite an existing server entry in `.mcp.json`.

Supports optional rename via `request.newName`. Applies a top-level mtime guard on the whole file (not per-server) to detect concurrent edits to any server. Validates `headersJson` and `restJson` before writing so the file is never left in a partial state. Write is atomic.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `request` — Updated config values including the original server name and optional new name.

---

### `deleteMcpServer`

```ts
export function deleteMcpServer(
  projectPath: string,
  serverName: string,
  mtimeAtRead: string,
): McpMutationResult
```

Remove a server entry from `.mcp.json`.

Returns `code: 'not-found'` when the file or the named server is absent. Applies an mtime guard — returns `code: 'conflict'` if the file changed since `mtimeAtRead`. When the last server is removed the `mcpServers` key is deleted from the object.

**Parameters:**
- `projectPath` — Absolute path to the project root.
- `serverName` — Key in `mcpServers` to remove.
- `mtimeAtRead` — ISO mtime captured at the last read; used for conflict detection.
