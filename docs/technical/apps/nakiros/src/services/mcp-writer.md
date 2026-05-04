# mcp-writer

**Path:** `apps/nakiros/src/services/mcp-writer.ts`

Read/write service for the project-root `.mcp.json` file. Unlike the hooks and
permissions experts (which extract a sub-block from `settings.json`), this
service reads and writes the **entire** `.mcp.json` file — MCP configuration is
a standalone file, not a sub-key. Used exclusively by the `mcp:*` IPC handler
and the `nakiros-mcp-expert` audit/fix runner flow.

## Exports

### `readMcpConfig`

```ts
export function readMcpConfig(projectPath: string): McpReadResult
```

Read the entire `.mcp.json` file from the project root.

Returns the full file content as pretty-printed JSON
(`JSON.stringify(JSON.parse(…), null, 2)`) to normalise whitespace before
handing it to the editor. When `.mcp.json` does not exist, returns
`{ content: '{}', mtime: '', exists: false }` so the editor has a valid
empty-object baseline.

**Parameters:**
- `projectPath` — absolute path to the project root directory

**Returns:** `McpReadResult` with `content`, `mtime`, `exists`, and `path` fields

---

### `saveMcpConfig`

```ts
export function saveMcpConfig(
  projectPath: string,
  jsonString: string,
  mtimeAtRead: string,
): McpExpertMutationResult
```

Write the entire `.mcp.json` file for the project. No merge with other keys —
this writes the complete file.

Implements an optimistic lock: if the file's current mtime differs from
`mtimeAtRead`, the save is aborted with `{ ok: false, code: 'conflict' }`. Pass
an empty `mtimeAtRead` to skip the check (safe only on first-ever write when the
file did not exist at read time).

When the parsed content is effectively empty (empty `{}` object, or `mcpServers`
key is absent or itself `{}`), the file is **deleted** instead of being written —
this keeps the project root clean.

**Parameters:**
- `projectPath` — absolute path to the project root
- `jsonString` — full new content of `.mcp.json` as a JSON string
- `mtimeAtRead` — mtime from the prior `readMcpConfig` call, used for conflict detection

**Returns:** `McpExpertMutationResult` — `{ ok: true }` on success, or `{ ok: false, code, message }` on failure
