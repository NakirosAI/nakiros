# claude-md.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-md.ts`

Registers `claudeMd:*` channels for the CLAUDE.md editor. The list channel also reports whether
an `AGENTS.md` exists at the project root (for the import suggestion). Audit history is served
from `~/.nakiros/<projectId>/claudemd/audit/`.

## IPC channels

- `claudeMd:list` — returns `ClaudeMdListResult` (file metadata + `agentsMdAtRoot` flag)
- `claudeMd:read` — returns `ClaudeMdFileContent` (raw content + mtime)
- `claudeMd:save` — overwrite CLAUDE.md; returns `ClaudeMdMutationResult`
- `claudeMd:delete` — delete CLAUDE.md; returns `ClaudeMdMutationResult`
- `claudeMd:listAudits` — returns `ClaudeMdAuditHistoryEntry[]` sorted newest-first
- `claudeMd:readAudit` — read a single archived audit report by absolute path

## Exports

### `claudeMdHandlers`

```ts
export const claudeMdHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
