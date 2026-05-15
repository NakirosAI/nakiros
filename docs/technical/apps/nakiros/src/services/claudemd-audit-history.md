# claudemd-audit-history.ts

**Path:** `apps/nakiros/src/services/claudemd-audit-history.ts`

Persisted history of CLAUDE.md audits archived whenever a run carries a `claudemdTarget`.
Storage layout: `~/.nakiros/<projectId>/claudemd/audit/audit-<ISO>.md`. The score is extracted
from the first ~80 lines of each report via a regex match on `**Score**: \`X/Y\``.

## Exports

### `listClaudemdAudits`

```ts
export function listClaudemdAudits(projectId: string): ClaudeMdAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/claudemd/audit/` and return archived audits sorted newest-first.
Parses the ISO timestamp from the filename rather than re-reading every file. Returns `[]`
when the directory doesn't exist.

### `readClaudemdAudit`

```ts
export function readClaudemdAudit(absolutePath: string): string | null
```

Read the markdown body of an archived CLAUDE.md audit. Rejects any path that doesn't start
with `~/.nakiros/` to prevent path-traversal from the renderer.
