# subagents-audit-history

**Path:** `apps/nakiros/src/services/subagents-audit-history.ts`

Persisted audit history for `.claude/agents/` subagent audits. Archived by `audit-runner.archiveReport` whenever a run carries a `subagentsTarget`. Storage layout:

```
~/.nakiros/<projectId>/subagents-audits/<encodedSubagentName>/audit-<ISO>.md
```

Path separators in the subagent filename are replaced by `__` to keep directory names flat (e.g. `team/reviewer.md` → `team__reviewer.md`). Each entry includes a `score` field extracted from the audit report header (`**Score**: N/M`).

## Exports

### `subagentsAuditArchiveDir`

```ts
export function subagentsAuditArchiveDir(projectId: string, subagentName: string): string
```

Compute the archive directory path for `(projectId, subagentName)`. Used by `audit-runner` to locate the target directory when archiving.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `subagentName` — Relative filename from `.claude/agents/` (e.g. `backend.md`).

**Returns:** Absolute path to `~/.nakiros/<projectId>/subagents-audits/<encoded>/`.

---

### `listSubagentsAudits`

```ts
export function listSubagentsAudits(
  projectId: string,
  subagentName: string,
): SubagentsAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/subagents-audits/<encoded-subagentName>/` and return the archived audits for that subagent, sorted newest-first.

Each entry includes a `score` string extracted from the first 80 lines of the report (e.g. `"11/15"`), or `null` when not found. Returns an empty array when the directory does not exist or is unreadable.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `subagentName` — Relative filename from `.claude/agents/`.

---

### `readSubagentsAudit`

```ts
export function readSubagentsAudit(absolutePath: string): string | null
```

Read the markdown body of an archived subagents audit. Returns `null` when the path is unknown or escapes the expected `~/.nakiros/` prefix — never trust a path coming from the renderer without bounding it.

**Parameters:**
- `absolutePath` — Full path to the audit `.md` file as returned by `listSubagentsAudits`.
