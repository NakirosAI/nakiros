import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

import type { Skill, SkillFileEntry } from '@nakiros/shared';

import { parseSkillEvals } from './eval-parser.js';
import { listProjects } from './project-scanner.js';

const HIDDEN_PATHS = new Set(['evals/workspace']);

function shouldHide(relativePath: string): boolean {
  for (const hidden of HIDDEN_PATHS) {
    if (relativePath === hidden || relativePath.startsWith(hidden + '/')) return true;
  }
  return false;
}

/**
 * Discover the root plugin directories Nakiros knows about.
 *
 * The canonical location is ~/.claude/plugins/<plugin>/skills/<name>/ — Claude
 * Code's user-global plugin registry. We also scan every tracked project for a
 * local override at <projectPath>/.claude/plugins/<plugin>/skills/<name>/ so a
 * team can ship a plugin alongside the repo, even if that path is uncommon in
 * practice.
 */
export interface PluginSkillLocation {
  pluginName: string;
  skillName: string;
  skillDir: string;
  origin: 'user' | 'project';
  /** Present when origin === 'project'. */
  projectId?: string;
}

function listUserPluginSkillLocations(): PluginSkillLocation[] {
  const root = join(homedir(), '.claude', 'plugins');
  if (!existsSync(root)) return [];

  const out: PluginSkillLocation[] = [];
  let plugins: import('fs').Dirent[];
  try {
    plugins = readdirSync(root, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return [];
  }

  for (const plugin of plugins) {
    const pluginPath = join(root, plugin.name);
    let isDir = false;
    try {
      isDir = statSync(pluginPath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const skillsDir = join(pluginPath, 'skills');
    if (!existsSync(skillsDir)) continue;

    let skillEntries: import('fs').Dirent[];
    try {
      skillEntries = readdirSync(skillsDir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      continue;
    }

    for (const skillEntry of skillEntries) {
      const skillDir = join(skillsDir, skillEntry.name);
      let skillIsDir = false;
      try {
        skillIsDir = statSync(skillDir).isDirectory();
      } catch {
        continue;
      }
      if (!skillIsDir) continue;
      out.push({
        pluginName: plugin.name,
        skillName: skillEntry.name,
        skillDir,
        origin: 'user',
      });
    }
  }
  return out;
}

function listProjectPluginSkillLocations(): PluginSkillLocation[] {
  const out: PluginSkillLocation[] = [];
  for (const project of listProjects()) {
    const root = join(project.projectPath, '.claude', 'plugins');
    if (!existsSync(root)) continue;

    let plugins: import('fs').Dirent[];
    try {
      plugins = readdirSync(root, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      continue;
    }

    for (const plugin of plugins) {
      const pluginPath = join(root, plugin.name);
      let isDir = false;
      try {
        isDir = statSync(pluginPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;

      const skillsDir = join(pluginPath, 'skills');
      if (!existsSync(skillsDir)) continue;

      let skillEntries: import('fs').Dirent[];
      try {
        skillEntries = readdirSync(skillsDir, { withFileTypes: true }) as import('fs').Dirent[];
      } catch {
        continue;
      }

      for (const skillEntry of skillEntries) {
        const skillDir = join(skillsDir, skillEntry.name);
        let skillIsDir = false;
        try {
          skillIsDir = statSync(skillDir).isDirectory();
        } catch {
          continue;
        }
        if (!skillIsDir) continue;
        out.push({
          pluginName: plugin.name,
          skillName: skillEntry.name,
          skillDir,
          origin: 'project',
          projectId: project.id,
        });
      }
    }
  }
  return out;
}

export function listPluginSkillLocations(): PluginSkillLocation[] {
  return [...listUserPluginSkillLocations(), ...listProjectPluginSkillLocations()];
}

export function resolvePluginSkillDir(
  pluginName: string,
  skillName: string,
  projectPath?: string,
): string {
  if (projectPath) {
    return join(projectPath, '.claude', 'plugins', pluginName, 'skills', skillName);
  }
  return join(homedir(), '.claude', 'plugins', pluginName, 'skills', skillName);
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

function buildSkill(loc: PluginSkillLocation): Skill {
  const skillMdPath = join(loc.skillDir, 'SKILL.md');
  let content = '';
  if (existsSync(skillMdPath)) {
    try {
      content = readFileSync(skillMdPath, 'utf8');
    } catch {
      // ignore
    }
  }

  return {
    name: loc.skillName,
    projectId: loc.origin === 'project' && loc.projectId ? loc.projectId : 'claude-plugin',
    skillPath: loc.skillDir,
    content,
    hasEvals: existsSync(join(loc.skillDir, 'evals')),
    hasReferences: existsSync(join(loc.skillDir, 'references')),
    hasTemplates: existsSync(join(loc.skillDir, 'templates')),
    files: scanDirectory(loc.skillDir, loc.skillDir),
    evals: parseSkillEvals(loc.skillDir, loc.skillName),
    auditCount: countAudits(loc.skillDir),
    pluginName: loc.pluginName,
    pluginOrigin: loc.origin,
  };
}

export function listPluginSkills(): Skill[] {
  const skills = listPluginSkillLocations().map(buildSkill);
  skills.sort((a, b) => {
    const pn = (a.pluginName ?? '').localeCompare(b.pluginName ?? '');
    if (pn !== 0) return pn;
    return a.name.localeCompare(b.name);
  });
  return skills;
}

export function readPluginSkill(pluginName: string, skillName: string): Skill | null {
  const locations = listPluginSkillLocations();
  const loc = locations.find(
    (l) => l.pluginName === pluginName && l.skillName === skillName,
  );
  if (!loc) return null;
  return buildSkill(loc);
}

export function readPluginSkillFile(
  pluginName: string,
  skillName: string,
  relativePath: string,
): string | null {
  const loc = listPluginSkillLocations().find(
    (l) => l.pluginName === pluginName && l.skillName === skillName,
  );
  if (!loc) return null;
  const filePath = join(loc.skillDir, relativePath);
  if (!filePath.startsWith(loc.skillDir)) return null;
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function savePluginSkillFile(
  pluginName: string,
  skillName: string,
  relativePath: string,
  content: string,
): void {
  const loc = listPluginSkillLocations().find(
    (l) => l.pluginName === pluginName && l.skillName === skillName,
  );
  if (!loc) return;
  const filePath = join(loc.skillDir, relativePath);
  if (!filePath.startsWith(loc.skillDir)) return;
  writeFileSync(filePath, content, 'utf8');
}
