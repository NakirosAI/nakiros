# mcp-audit-history

**Path:** `apps/nakiros/src/services/mcp-audit-history.ts`

Persisted history of MCP audits for a given project. Archives audit reports
produced by the audit-runner when a run carries a `mcpTarget`. Singleton layout
(mirrors `hooks-audit-history`) — no sub-folder per name, one flat directory per
project:

```
~/.nakiros/<projectId>/mcp-audits/audit-<ISO>.md
```

## Exports

### `mcpAuditArchiveDir`

```ts
export function mcpAuditArchiveDir(projectId: string): string
```

Compute the archive directory path for `projectId`. Used by `audit-runner` to
locate the target directory when archiving a MCP audit report.

**Parameters:**
- `projectId` — Nakiros project id

**Returns:** absolute path to `~/.nakiros/<projectId>/mcp-audits/`

---

### `listMcpAudits`

```ts
export function listMcpAudits(projectId: string): McpAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/mcp-audits/` and return the archived audits sorted
newest-first.

Reads filenames only — no file content is read. The ISO timestamp is decoded
from the filename (`audit-2026-05-04T14-22-03.md` → `2026-05-04T14:22:03Z`).
Returns `[]` when the directory does not exist.

**Parameters:**
- `projectId` — Nakiros project id

**Returns:** array of `McpAuditHistoryEntry` sorted by `timestamp` descending

---

### `readMcpAudit`

```ts
export function readMcpAudit(absolutePath: string): string | null
```

Read the markdown body of an archived MCP audit. Returns `null` when the path
escapes the expected `~/.nakiros/` prefix (path-traversal guard) or the file
does not exist. Never trusts a path coming from the renderer without bounding it.

**Parameters:**
- `absolutePath` — absolute path to the archived `.md` file

**Returns:** markdown content of the audit report, or `null` on error/missing
