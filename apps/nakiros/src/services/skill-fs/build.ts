import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { Skill } from '@nakiros/shared';

import { parseSkillEvals } from '../eval-parser.js';

import { countAuditReports } from './audits.js';
import { scanSkillDirectory } from './scan.js';

/**
 * Build a `Skill` record from a skill directory on disk. Reads `SKILL.md`
 * (best-effort — empty string if missing/unreadable), scans the directory
 * tree, parses the eval suite, and counts archived audits.
 *
 * `extras` is shallow-merged at the end and is the place to set scope-specific
 * fields like `pluginName` / `marketplaceName`.
 */
export interface BuildSkillRecordOptions {
  skillDir: string;
  skillName: string;
  projectId: string;
  extras?: Partial<Skill>;
}

/** See `BuildSkillRecordOptions`. */
export function buildSkillRecord({
  skillDir,
  skillName,
  projectId,
  extras,
}: BuildSkillRecordOptions): Skill {
  const skillMdPath = join(skillDir, 'SKILL.md');
  let content = '';
  if (existsSync(skillMdPath)) {
    try {
      content = readFileSync(skillMdPath, 'utf8');
    } catch {
      // ignore
    }
  }

  const base: Skill = {
    name: skillName,
    projectId,
    skillPath: skillDir,
    content,
    hasEvals: existsSync(join(skillDir, 'evals')),
    hasReferences: existsSync(join(skillDir, 'references')),
    hasTemplates: existsSync(join(skillDir, 'templates')),
    files: scanSkillDirectory(skillDir, skillDir),
    evals: parseSkillEvals(skillDir, skillName),
    auditCount: countAuditReports(skillDir),
  };

  return extras ? { ...base, ...extras } : base;
}
