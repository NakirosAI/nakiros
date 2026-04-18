import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import type { Skill, SkillFileEntry } from '@nakiros/shared';
import { parseSkillEvals } from './eval-parser.js';

function countAudits(skillDir: string): number {
  const auditsDir = join(skillDir, 'audits');
  if (!existsSync(auditsDir)) return 0;
  try {
    return readdirSync(auditsDir).filter((f) => f.startsWith('audit-') && f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

/**
 * Recursively scan a directory and return a tree of files/folders.
 */
const HIDDEN_PATHS = new Set(['evals/workspace']);

function shouldHide(relativePath: string): boolean {
  for (const hidden of HIDDEN_PATHS) {
    if (relativePath === hidden || relativePath.startsWith(hidden + '/')) return true;
  }
  return false;
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

  // Directories first, then files, both alphabetical
  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * List all skills in a project's .claude/skills/ directory.
 */
export function listSkills(projectPath: string, projectId: string): Skill[] {
  const skillsDir = join(projectPath, '.claude', 'skills');
  if (!existsSync(skillsDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const skills: Skill[] = [];

  for (const name of entries) {
    const skillDir = join(skillsDir, name);
    const skillMdPath = join(skillDir, 'SKILL.md');

    let content = '';
    if (existsSync(skillMdPath)) {
      try {
        content = readFileSync(skillMdPath, 'utf8');
      } catch {
        // ignore
      }
    }

    skills.push({
      name,
      projectId,
      skillPath: skillDir,
      content,
      hasEvals: existsSync(join(skillDir, 'evals')),
      hasReferences: existsSync(join(skillDir, 'references')),
      hasTemplates: existsSync(join(skillDir, 'templates')),
      files: scanDirectory(skillDir, skillDir),
      evals: parseSkillEvals(skillDir, name),
      auditCount: countAudits(skillDir),
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Get a single skill by name.
 */
export function getSkill(projectPath: string, projectId: string, skillName: string): Skill | null {
  const skillDir = join(projectPath, '.claude', 'skills', skillName);
  if (!existsSync(skillDir)) return null;

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
    projectId,
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
 * Save/update a skill's SKILL.md content.
 */
export function saveSkill(projectPath: string, skillName: string, content: string): void {
  const skillMdPath = join(projectPath, '.claude', 'skills', skillName, 'SKILL.md');
  writeFileSync(skillMdPath, content, 'utf8');
}

/**
 * Read any file inside a skill directory by relative path.
 */
export function readSkillFile(projectPath: string, skillName: string, relativePath: string): string | null {
  const filePath = join(projectPath, '.claude', 'skills', skillName, relativePath);
  // Security: ensure the resolved path stays within the skill directory
  const skillDir = join(projectPath, '.claude', 'skills', skillName);
  if (!filePath.startsWith(skillDir)) return null;
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write any file inside a skill directory by relative path.
 */
export function saveSkillFile(projectPath: string, skillName: string, relativePath: string, content: string): void {
  const filePath = join(projectPath, '.claude', 'skills', skillName, relativePath);
  const skillDir = join(projectPath, '.claude', 'skills', skillName);
  if (!filePath.startsWith(skillDir)) return;
  writeFileSync(filePath, content, 'utf8');
}
