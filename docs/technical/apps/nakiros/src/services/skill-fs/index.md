# index.ts

**Path:** `apps/nakiros/src/services/skill-fs/index.ts`

Barrel re-export for the `skill-fs` module. Pulls the helpers from `fs.ts`, `scan.ts`, `audits.ts`, `io.ts`, and `build.ts` into a single import surface so consumers can write `import { buildSkillRecord, scanSkillDirectory, … } from './skill-fs/index.js'`.

## Re-exports

- `safeReaddir`, `isDirectoryStat` — see [fs.md](./fs.md)
- `HIDDEN_PATHS`, `isHiddenPath`, `scanSkillDirectory` — see [scan.md](./scan.md)
- `countAuditReports` — see [audits.md](./audits.md)
- `validateSkillFilePath`, `readSkillFileSafe`, `writeSkillFileSafe` — see [io.md](./io.md)
- `buildSkillRecord`, `BuildSkillRecordOptions` — see [build.md](./build.md)
