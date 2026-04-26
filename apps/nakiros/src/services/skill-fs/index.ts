/**
 * Shared filesystem primitives for skill scopes (project, bundled,
 * claude-global, plugin). Every skill-reader builds on top of these helpers
 * to avoid duplicating directory scanning, audit counting, path validation,
 * and `Skill` record assembly.
 */

export { safeReaddir, isDirectoryStat } from './fs.js';
export { HIDDEN_PATHS, isHiddenPath, scanSkillDirectory } from './scan.js';
export { countAuditReports } from './audits.js';
export { validateSkillFilePath, readSkillFileSafe, writeSkillFileSafe } from './io.js';
export { buildSkillRecord, type BuildSkillRecordOptions } from './build.js';
