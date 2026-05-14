# output-styles-audit-history

**Path:** `apps/nakiros/src/services/output-styles-audit-history.ts`

Persisted audit history for `.claude/output-styles/` audits. Archived by `audit-runner.archiveReport` whenever a run carries an `outputStylesTarget`. Storage layout:

```
~/.nakiros/<projectId>/output-styles-audits/<encodedStyleName>/audit-<ISO>.md
```

Path separators in the style name are replaced by `__` to keep directory names flat (e.g. `subdir/explanatory.md` → `subdir__explanatory.md`).

## Exports

### `outputStylesAuditArchiveDir`

```ts
export function outputStylesAuditArchiveDir(projectId: string, styleName: string): string
```

Compute the archive directory path for `(projectId, styleName)`. Used by `audit-runner` to locate the target directory when archiving a report.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `styleName` — Relative path from `.claude/output-styles/` (e.g. `minimal.md`).

**Returns:** Absolute path to `~/.nakiros/<projectId>/output-styles-audits/<encoded>/`.

---

### `listOutputStylesAudits`

```ts
export function listOutputStylesAudits(
  projectId: string,
  styleName: string,
): OutputStylesAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/output-styles-audits/<encoded-styleName>/` and return the archived audits for that style, sorted newest-first.

Returns an empty array when the directory does not exist or is unreadable.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `styleName` — Relative path from `.claude/output-styles/`.

---

### `readOutputStylesAudit`

```ts
export function readOutputStylesAudit(absolutePath: string): string | null
```

Read the markdown body of an archived output-styles audit. Returns `null` when the path is unknown or escapes the expected `~/.nakiros/` prefix — never trust a path coming from the renderer without bounding it.

**Parameters:**
- `absolutePath` — Full path to the audit `.md` file as returned by `listOutputStylesAudits`.
