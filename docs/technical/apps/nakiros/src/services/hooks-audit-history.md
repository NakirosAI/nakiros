# hooks-audit-history

**Path:** `apps/nakiros/src/services/hooks-audit-history.ts`

Persisted history of hooks audit reports for a given project. Implements the singleton layout (mirrors `claudemd-audit-history` — no sub-folder per entity name): archived reports live at `~/.nakiros/<projectId>/hooks-audits/audit-<ISO>.md`. The ISO timestamp is encoded in the filename with `:` replaced by `-` (filesystem-safe); `listHooksAudits` reverses the substitution for display and sorting. Called by `audit-runner.archiveReport` whenever a run carries a `hooksTarget`.

## Exports

### `hooksAuditArchiveDir`

```ts
export function hooksAuditArchiveDir(projectId: string): string
```

Compute the archive directory path for `projectId`. Used by `audit-runner` to locate the target directory when archiving a hooks audit report.

**Parameters:**
- `projectId` — stable Nakiros project identifier

**Returns:** absolute path to `~/.nakiros/<projectId>/hooks-audits/`.

---

### `listHooksAudits`

```ts
export function listHooksAudits(projectId: string): HooksAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/hooks-audits/` and return the archived audits sorted newest-first.

Files that do not match the `audit-<ISO>.md` filename pattern are silently ignored. File-system errors (missing directory, permission issues) return an empty array rather than throwing.

**Parameters:**
- `projectId` — stable Nakiros project identifier

**Returns:** array of `HooksAuditHistoryEntry` (`path`, `timestamp`, `sizeBytes`), newest first. Empty when no audits exist.

---

### `readHooksAudit`

```ts
export function readHooksAudit(absolutePath: string): string | null
```

Read the markdown body of an archived hooks audit. Returns `null` when the path is unknown or escapes the expected `~/.nakiros/` prefix — path-traversal guard applied before any I/O.

**Parameters:**
- `absolutePath` — absolute path to the audit `.md` file, as returned by `listHooksAudits`

**Returns:** raw markdown string, or `null` when the path is invalid, outside `~/.nakiros/`, missing, or a directory.
