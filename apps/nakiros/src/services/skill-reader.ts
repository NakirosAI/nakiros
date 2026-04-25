import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { Skill } from '@nakiros/shared';

import {
  buildSkillRecord,
  readSkillFileSafe,
  writeSkillFileSafe,
} from './skill-fs/index.js';

function projectSkillsDir(projectPath: string): string {
  return join(projectPath, '.claude', 'skills');
}

function projectSkillDir(projectPath: string, skillName: string): string {
  return join(projectSkillsDir(projectPath), skillName);
}

/**
 * List all skills in a project's `.claude/skills/` directory.
 */
export function listSkills(projectPath: string, projectId: string): Skill[] {
  const skillsDir = projectSkillsDir(projectPath);
  if (!existsSync(skillsDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const skills = entries.map((name) =>
    buildSkillRecord({ skillDir: join(skillsDir, name), skillName: name, projectId }),
  );
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Get a single skill by name.
 */
export function getSkill(projectPath: string, projectId: string, skillName: string): Skill | null {
  const skillDir = projectSkillDir(projectPath, skillName);
  if (!existsSync(skillDir)) return null;
  return buildSkillRecord({ skillDir, skillName, projectId });
}

/**
 * Save/update a skill's SKILL.md content.
 */
export function saveSkill(projectPath: string, skillName: string, content: string): void {
  const skillMdPath = join(projectSkillDir(projectPath, skillName), 'SKILL.md');
  writeFileSync(skillMdPath, content, 'utf8');
}

/**
 * Read any file inside a skill directory by relative path.
 */
export function readSkillFile(projectPath: string, skillName: string, relativePath: string): string | null {
  return readSkillFileSafe(projectSkillDir(projectPath, skillName), relativePath);
}

/**
 * Write any file inside a skill directory by relative path.
 */
export function saveSkillFile(projectPath: string, skillName: string, relativePath: string, content: string): void {
  writeSkillFileSafe(projectSkillDir(projectPath, skillName), relativePath, content);
}
