# audits.ts

**Path:** `apps/nakiros/src/services/skill-fs/audits.ts`

Counts archived audit reports for a skill. Used by every skill-reader to populate `Skill.auditCount`.

## Exports

### `function countAuditReports`

Number of archived audit reports in `<skillDir>/audits/`. An audit report is a file named `audit-<timestamp>.md`. Returns `0` when the directory is missing or unreadable.

```ts
export function countAuditReports(skillDir: string): number
```
