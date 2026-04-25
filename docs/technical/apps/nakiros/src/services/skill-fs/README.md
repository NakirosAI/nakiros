# skill-fs/

**Path:** `apps/nakiros/src/services/skill-fs/`

Shared filesystem primitives for every skill scope (project, bundled, claude-global, plugin). Centralises directory scanning, audit counting, path-traversal-safe IO, and `Skill` record assembly so each reader stays a thin facade.

## Files

- [fs.ts](./fs.md) — Low-level helpers: `safeReaddir` (no-throw `readdirSync`), `isDirectoryStat` (symlink-aware directory check).
- [scan.ts](./scan.md) — Recursive `scanSkillDirectory` returning `SkillFileEntry[]`, with the `evals/workspace` hide rule.
- [audits.ts](./audits.md) — `countAuditReports` for `<skillDir>/audits/audit-*.md`.
- [io.ts](./io.md) — Path-traversal-safe `validateSkillFilePath`, `readSkillFileSafe`, `writeSkillFileSafe`.
- [build.ts](./build.md) — `buildSkillRecord` assembling the canonical `Skill` (SKILL.md content + tree + eval suite + audit count).
- [index.ts](./index.md) — Barrel re-export — single import surface for the module.
