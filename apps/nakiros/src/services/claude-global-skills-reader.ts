import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

import type { Skill, SkillFileEntry } from '@nakiros/shared';

import { parseSkillEvals } from './eval-parser.js';

const HIDDEN_PATHS = new Set(['evals/workspace']);

function shouldHide(relativePath: string): boolean {
  for (const hidden of HIDDEN_PATHS) {
    if (relativePath === hidden || relativePath.startsWith(hidden + '/')) return true;
  }
  return false;
}

/** Resolve the user-global Claude skills directory: ~/.claude/skills/. */
export function getClaudeGlobalSkillsDir(): string {
  return join(homedir(), '.claude', 'skills');
}

/** The Nakiros-managed skills directory. Symlinks into this are our own — we hide them. */
const NAKIROS_SKILLS_DIR = join(homedir(), '.nakiros', 'skills');

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

function scanDirectory(dirPath: string, basePath: string): SkillFileEntry[] {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return [];
  }

  const result: SkillFileEntry[] = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(basePath, fullPath);
    if (shouldHide(relPath)) continue;

    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        relativePath: relPath,
        isDirectory: true,
        children: scanDirectory(fullPath, basePath),
      });
    } else {
      let sizeBytes = 0;
      try {
        sizeBytes = statSync(fullPath).size;
      } catch {
        // ignore
      }
      result.push({
        name: entry.name,
        relativePath: relPath,
        isDirectory: false,
        sizeBytes,
      });
    }
  }

  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

function countAudits(skillDir: string): number {
  const auditsDir = join(skillDir, 'audits');
  if (!existsSync(auditsDir)) return 0;
  try {
    return readdirSync(auditsDir).filter((f) => f.startsWith('audit-') && f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function buildSkill(skillDir: string, skillName: string): Skill {
  const skillMdPath = join(skillDir, 'SKILL.md');
  let content = '';
  if (existsSync(skillMdPath)) {
    try {
      content = readFileSync(skillMdPath, 'utf8');
    } catch {
      // ignore
    }
  }

  return {
    name: skillName,
    projectId: 'claude-global',
    skillPath: skillDir,
    content,
    hasEvals: existsSync(join(skillDir, 'evals')),
    hasReferences: existsSync(join(skillDir, 'references')),
    hasTemplates: existsSync(join(skillDir, 'templates')),
    files: scanDirectory(skillDir, skillDir),
    evals: parseSkillEvals(skillDir, skillName),
    auditCount: countAudits(skillDir),
  };
}

/**
 * List user-global skills in ~/.claude/skills/.
 * EXCLUDES symlinks — those are Nakiros-managed bundled skills (already shown in "Nakiros Skills").
 */
export function listClaudeGlobalSkills(): Skill[] {
  const dir = getClaudeGlobalSkillsDir();
  if (!existsSync(dir)) return [];

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Accept both real directories and symlinks that resolve to directories.
    // `entry.isDirectory()` returns false for symlinks (it uses lstat), so we
    // need to statSync (which follows symlinks) to know if the target is a dir.
    let isSkillDir = false;
    try {
      isSkillDir = statSync(fullPath).isDirectory();
    } catch {
      continue; // broken symlink or inaccessible
    }
    if (!isSkillDir) continue;

    // Only skip symlinks that point into our own Nakiros-managed area.
    // Other symlinks (installed by the user pointing elsewhere) are legitimate global skills.
    if (isNakirosManagedSymlink(fullPath)) continue;

    skills.push(buildSkill(fullPath, entry.name));
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
  const dir = getClaudeGlobalSkillsDir();
  const skillDir = join(dir, skillName);
  if (!existsSync(skillDir)) return null;
  // Hide only Nakiros-managed symlinks — user-installed symlinks are valid.
  if (isNakirosManagedSymlink(skillDir)) return null;
  return buildSkill(skillDir, skillName);
}

/** Read an arbitrary file inside a user-global skill. Refuses path-traversal; returns `null` on miss. */
export function readClaudeGlobalSkillFile(skillName: string, relativePath: string): string | null {
  const dir = getClaudeGlobalSkillsDir();
  const filePath = join(dir, skillName, relativePath);
  const skillDir = join(dir, skillName);
  if (!filePath.startsWith(skillDir)) return null;
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Write an arbitrary file inside a user-global skill. Refuses path-traversal silently. */
export function saveClaudeGlobalSkillFile(skillName: string, relativePath: string, content: string): void {
  const dir = getClaudeGlobalSkillsDir();
  const filePath = join(dir, skillName, relativePath);
  const skillDir = join(dir, skillName);
  if (!filePath.startsWith(skillDir)) return;
  writeFileSync(filePath, content, 'utf8');
}
