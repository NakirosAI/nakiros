import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import type { Skill, SkillFileEntry } from '@nakiros/shared';

import { parseSkillEvals } from './eval-parser.js';
import { getNakirosSkillsDir } from './bundled-skills-sync.js';

const HIDDEN_PATHS = new Set(['evals/workspace']);

function shouldHide(relativePath: string): boolean {
  for (const hidden of HIDDEN_PATHS) {
    if (relativePath === hidden || relativePath.startsWith(hidden + '/')) return true;
  }
  return false;
}

/**
 * Bundled skills live at ~/.nakiros/skills/ after the initial sync from the app ROM.
 * All reads/writes from the UI target this canonical location (not the app ROM).
 */
function getBundledSkillsDir(): string {
  return getNakirosSkillsDir();
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
    projectId: 'nakiros-bundled',
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
 * List all Nakiros bundled skills.
 */
export function listBundledSkills(): Skill[] {
  const dir = getBundledSkillsDir();
  if (!existsSync(dir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
  } catch {
    return [];
  }

  const skills = entries.map((name) => buildSkill(join(dir, name), name));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Read a single bundled skill.
 */
export function readBundledSkill(skillName: string): Skill | null {
  const dir = getBundledSkillsDir();
  const skillDir = join(dir, skillName);
  if (!existsSync(skillDir)) return null;
  return buildSkill(skillDir, skillName);
}

/**
 * Read an arbitrary file within a bundled skill.
 */
export function readBundledSkillFile(skillName: string, relativePath: string): string | null {
  const dir = getBundledSkillsDir();
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

/**
 * Write a file within a bundled skill (used when Nakiros auto-improves its own skills).
 */
export function saveBundledSkillFile(skillName: string, relativePath: string, content: string): void {
  const dir = getBundledSkillsDir();
  const filePath = join(dir, skillName, relativePath);
  const skillDir = join(dir, skillName);
  if (!filePath.startsWith(skillDir)) return;
  writeFileSync(filePath, content, 'utf8');
}
