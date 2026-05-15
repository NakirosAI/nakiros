# claude-mcp.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-mcp.ts`

Registers `claudeMcp:*` channels for the Module 5 V2 `.mcp.json` editor. List reuses the
project-wide scan; read/create/save/delete operate on one MCP server at a time but rewrite the
whole `.mcp.json` atomically with a top-level mtime guard.

**Note:** These channels are distinct from `mcp:*` (the `nakiros-mcp-expert` audit/fix flow).

## IPC channels

- `claudeMcp:list` — returns `McpInfo` (count + items) for the project
- `claudeMcp:read` — returns `McpServerForEditor` for one server entry
- `claudeMcp:create` — create a new server entry; returns `McpMutationResult`
- `claudeMcp:save` — overwrite a server entry; returns `McpMutationResult`
- `claudeMcp:delete` — delete a server entry with mtime guard; returns `McpMutationResult`

## Exports

### `claudeMcpHandlers`

```ts
export const claudeMcpHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
