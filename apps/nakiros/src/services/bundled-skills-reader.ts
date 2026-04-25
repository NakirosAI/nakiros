import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import type { Skill } from '@nakiros/shared';

import { getNakirosSkillsDir } from './bundled-skills-sync.js';
import {
  buildSkillRecord,
  readSkillFileSafe,
  writeSkillFileSafe,
} from './skill-fs/index.js';

/**
 * Bundled skills live at ~/.nakiros/skills/ after the initial sync from the app ROM.
 * All reads/writes from the UI target this canonical location (not the app ROM).
 */
function getBundledSkillsDir(): string {
  return getNakirosSkillsDir();
}

const BUNDLED_PROJECT_ID = 'nakiros-bundled';

/**
 * List all Nakiros bundled skills.
 */
export function listBundledSkills(): Skill[] {
  const dir = getBundledSkillsDir();
  if (!existsSync(dir)) return [];

  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const skills = names.map((name) =>
    buildSkillRecord({
      skillDir: join(dir, name),
      skillName: name,
      projectId: BUNDLED_PROJECT_ID,
    }),
  );
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Read a single bundled skill.
 */
export function readBundledSkill(skillName: string): Skill | null {
  const skillDir = join(getBundledSkillsDir(), skillName);
  if (!existsSync(skillDir)) return null;
  return buildSkillRecord({
    skillDir,
    skillName,
    projectId: BUNDLED_PROJECT_ID,
  });
}

/**
 * Read an arbitrary file within a bundled skill.
 */
export function readBundledSkillFile(skillName: string, relativePath: string): string | null {
  return readSkillFileSafe(join(getBundledSkillsDir(), skillName), relativePath);
}

/**
 * Write a file within a bundled skill (used when Nakiros auto-improves its own skills).
 */
export function saveBundledSkillFile(skillName: string, relativePath: string, content: string): void {
  writeSkillFileSafe(join(getBundledSkillsDir(), skillName), relativePath, content);
}
