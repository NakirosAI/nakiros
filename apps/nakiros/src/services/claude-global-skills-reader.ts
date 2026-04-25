import { existsSync, lstatSync, realpathSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type { Skill } from '@nakiros/shared';

import {
  buildSkillRecord,
  isDirectoryStat,
  readSkillFileSafe,
  safeReaddir,
  writeSkillFileSafe,
} from './skill-fs/index.js';

/** Resolve the user-global Claude skills directory: ~/.claude/skills/. */
export function getClaudeGlobalSkillsDir(): string {
  return join(homedir(), '.claude', 'skills');
}

/** The Nakiros-managed skills directory. Symlinks into this are our own — we hide them. */
const NAKIROS_SKILLS_DIR = join(homedir(), '.nakiros', 'skills');

const CLAUDE_GLOBAL_PROJECT_ID = 'claude-global';

/**
 * True if `path` is a symlink whose target is inside ~/.nakiros/skills/.
 * Those are Nakiros-managed bundled skills and shown in "Nakiros Skills" instead.
 * Other symlinks (user-installed pointing elsewhere) are valid global skills to show.
 */
function isNakirosManagedSymlink(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (!stat.isSymbolicLink()) return false;
    const resolved = realpathSync(path);
    return resolved === NAKIROS_SKILLS_DIR || resolved.startsWith(NAKIROS_SKILLS_DIR + '/');
  } catch {
    return false;
  }
}

/**
 * List user-global skills in ~/.claude/skills/.
 * EXCLUDES symlinks — those are Nakiros-managed bundled skills (already shown in "Nakiros Skills").
 */
export function listClaudeGlobalSkills(): Skill[] {
  const dir = getClaudeGlobalSkillsDir();
  if (!existsSync(dir)) return [];

  const skills: Skill[] = [];
  for (const entry of safeReaddir(dir)) {
    const fullPath = join(dir, entry.name);

    // `entry.isDirectory()` uses lstat → false for symlinks. Use stat (follows
    // symlinks) to accept directories AND symlinks resolving to directories.
    if (!isDirectoryStat(fullPath)) continue;

    // Skip only symlinks pointing into our own Nakiros-managed area.
    if (isNakirosManagedSymlink(fullPath)) continue;

    skills.push(
      buildSkillRecord({
        skillDir: fullPath,
        skillName: entry.name,
        projectId: CLAUDE_GLOBAL_PROJECT_ID,
      }),
    );
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Read one user-global skill by name. Nakiros-managed symlinks return `null`
 * so they don't show up in the "Claude Global" list (they already appear in
 * "Nakiros Skills").
 */
export function readClaudeGlobalSkill(skillName: string): Skill | null {
  const skillDir = join(getClaudeGlobalSkillsDir(), skillName);
  if (!existsSync(skillDir)) return null;
  if (isNakirosManagedSymlink(skillDir)) return null;
  return buildSkillRecord({
    skillDir,
    skillName,
    projectId: CLAUDE_GLOBAL_PROJECT_ID,
  });
}

/** Read an arbitrary file inside a user-global skill. Refuses path-traversal; returns `null` on miss. */
export function readClaudeGlobalSkillFile(skillName: string, relativePath: string): string | null {
  return readSkillFileSafe(join(getClaudeGlobalSkillsDir(), skillName), relativePath);
}

/** Write an arbitrary file inside a user-global skill. Refuses path-traversal silently. */
export function saveClaudeGlobalSkillFile(skillName: string, relativePath: string, content: string): void {
  writeSkillFileSafe(join(getClaudeGlobalSkillsDir(), skillName), relativePath, content);
}
