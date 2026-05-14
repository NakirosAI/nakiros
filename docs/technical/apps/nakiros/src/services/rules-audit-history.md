# rules-audit-history

**Path:** `apps/nakiros/src/services/rules-audit-history.ts`

Persisted audit history for `.claude/rules/` rule audits. Archived by `audit-runner.archiveReport` whenever a run carries a `rulesTarget`. Storage layout:

```
~/.nakiros/<projectId>/rules-audits/<encodedRuleName>/audit-<ISO>.md
```

Path separators in the rule name are replaced by `__` to keep directory names flat (e.g. `frontend/styling.md` → `frontend__styling.md`). Each entry includes a `score` field extracted from the audit report header (`**Score**: N/M`).

## Exports

### `rulesAuditArchiveDir`

```ts
export function rulesAuditArchiveDir(projectId: string, ruleName: string): string
```

Compute the archive directory path for `(projectId, ruleName)`. Used by `audit-runner` to locate the target directory when archiving.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `ruleName` — Relative path from `.claude/rules/` (e.g. `i18n.md`).

**Returns:** Absolute path to `~/.nakiros/<projectId>/rules-audits/<encoded>/`.

---

### `listRulesAudits`

```ts
export function listRulesAudits(
  projectId: string,
  ruleName: string,
): RulesAuditHistoryEntry[]
```

Scan `~/.nakiros/<projectId>/rules-audits/<encoded-ruleName>/` and return the archived audits for that rule, sorted newest-first.

Each entry includes a `score` string extracted from the first 80 lines of the report (e.g. `"11/14"`), or `null` when not found. Returns an empty array when the directory does not exist or is unreadable.

**Parameters:**
- `projectId` — Nakiros project identifier.
- `ruleName` — Relative path from `.claude/rules/`.

---

### `readRulesAudit`

```ts
export function readRulesAudit(absolutePath: string): string | null
```

Read the markdown body of an archived rules audit. Returns `null` when the path is unknown or escapes the expected `~/.nakiros/` prefix — never trust a path coming from the renderer without bounding it.

**Parameters:**
- `absolutePath` — Full path to the audit `.md` file as returned by `listRulesAudits`.
