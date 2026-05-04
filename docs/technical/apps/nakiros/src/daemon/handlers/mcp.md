# mcp

**Path:** `apps/nakiros/src/daemon/handlers/mcp.ts`

IPC handler bundle for the `nakiros-mcp-expert` audit/fix/create flow. Exposes
four channels for reading, writing, and browsing the history of the project-root
`.mcp.json` file at the JSON-string level — the expert skill uses these to read
and rewrite the entire config as a whole.

**Important:** these channels are distinct from `claudeMcp:*` (Module 5 V2),
which provide a structured form-based editor for individual MCP servers.

## IPC channels

- `mcp:read` — read the entire `.mcp.json` as pretty-printed JSON; returns `McpReadResult`
- `mcp:save` — write the entire `.mcp.json` (no merge); returns `McpExpertMutationResult`
- `mcp:listAudits` — list archived audit reports for a project, newest-first; returns `McpAuditHistoryEntry[]`
- `mcp:readAudit` — read the markdown body of an archived audit; path-traversal guarded to `~/.nakiros/`

## Exports

### `mcpHandlers`

```ts
export const mcpHandlers: HandlerRegistry
```

Handler registry object containing the four `mcp:*` IPC channel implementations.
Merged into the global registry by `buildHandlerRegistry()` in `handlers/index.ts`.
