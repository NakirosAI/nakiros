# permissions-audit-history

**Path:** `apps/nakiros/src/services/permissions-audit-history.ts`

Persisted audit history for permissions audits. Archived by `audit-runner.archiveReport` whenever a run carries a `permissionsTarget`. Scope-aware layout — each scope gets its own sub-folder:

```
~/.nakiros/<projectId>/permissions-audits/project/audit-<ISO>.md
~/.nakiros/<projectId>/permissions-audits/local/audit-<ISO>.md
```

Legacy flat audits (created before the scope toggle was added) are left as orphans; no migration is performed.

## Exports

### `permissionsAuditArchiveDir`

```ts
export function permissionsAuditArchiveDir(
  projectId: string,
  scope: PermissionsExpertScope,
): string
```

Compute the archive directory path for `projectId` + `scope`. Used by `audit-runner` to locate the target directory when archiving a permissions audit report.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `scope` — `'project'` or `'local'`.

**Returns:** Absolute path to `~/.nakiros/<projectId>/permissions-audits/<scope>/`.

---

### `listPermissionsAudits`

```ts
export function listPermissionsAudits(
  projectId: string,
  scope: PermissionsExpertScope,
): PermissionsAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/permissions-audits/<scope>/` and return the archived audits sorted newest-first.

Returns an empty array when the directory does not exist or is unreadable.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `scope` — `'project'` or `'local'`.

---

### `readPermissionsAudit`

```ts
export function readPermissionsAudit(absolutePath: string): string | null
```

Read the markdown body of an archived permissions audit. Returns `null` when the path is unknown or escapes the expected `~/.nakiros/` prefix — never trust a path coming from the renderer without bounding it.

**Parameters:**
- `absolutePath` — Full path to the audit `.md` file as returned by `listPermissionsAudits`.
