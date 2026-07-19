import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { Skill } from '@nakiros/shared';
import type { ConfigurationProvider } from '@nakiros/shared';

import {
  buildSkillRecord,
  readSkillFileSafe,
  writeSkillFileSafe,
} from './skill-fs/index.js';

function projectSkillsDir(projectPath: string, provider: ConfigurationProvider = 'claude'): string {
  return join(projectPath, provider === 'codex' ? '.agents' : '.claude', 'skills');
}

function projectSkillDir(
  projectPath: string,
  skillName: string,
  provider: ConfigurationProvider = 'claude',
): string {
  return join(projectSkillsDir(projectPath, provider), skillName);
}

/**
 * List all skills in a project's `.claude/skills/` directory.
 */
export function listSkills(
  projectPath: string,
  projectId: string,
  provider: ConfigurationProvider = 'claude',
): Skill[] {
  const skillsDir = projectSkillsDir(projectPath, provider);
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
export function getSkill(projectPath: string, projectId: string, skillName: string, provider: ConfigurationProvider = 'claude'): Skill | null {
  const skillDir = projectSkillDir(projectPath, skillName, provider);
  if (!existsSync(skillDir)) return null;
  return buildSkillRecord({ skillDir, skillName, projectId });
}

/**
 * Save/update a skill's SKILL.md content.
 */
export function saveSkill(projectPath: string, skillName: string, content: string, provider: ConfigurationProvider = 'claude'): void {
  const skillMdPath = join(projectSkillDir(projectPath, skillName, provider), 'SKILL.md');
  writeFileSync(skillMdPath, content, 'utf8');
}

/**
 * Read any file inside a skill directory by relative path.
 */
export function readSkillFile(projectPath: string, skillName: string, relativePath: string, provider: ConfigurationProvider = 'claude'): string | null {
  return readSkillFileSafe(projectSkillDir(projectPath, skillName, provider), relativePath);
}

/**
 * Write any file inside a skill directory by relative path.
 */
export function saveSkillFile(projectPath: string, skillName: string, relativePath: string, content: string, provider: ConfigurationProvider = 'claude'): void {
  writeSkillFileSafe(projectSkillDir(projectPath, skillName, provider), relativePath, content);
}
