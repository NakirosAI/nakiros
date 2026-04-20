import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
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

/**
 * Claude Code clones each plugin marketplace to
 * ~/.claude/plugins/marketplaces/<marketplace>/ and the plugins themselves
 * live at <marketplace>/plugins/<plugin>/, with skills under
 * <plugin>/skills/<skill>/SKILL.md. Not every plugin ships skills (some only
 * have agents/ or commands/), so we tolerate missing skills/ dirs silently.
 */
export interface PluginSkillLocation {
  marketplaceName: string;
  pluginName: string;
  skillName: string;
  skillDir: string;
}

function safeReaddir(path: string): import('fs').Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }) as import('fs').Dirent[];
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function listPluginSkillLocations(): PluginSkillLocation[] {
  const marketplacesRoot = join(homedir(), '.claude', 'plugins', 'marketplaces');
  if (!existsSync(marketplacesRoot)) return [];

  const out: PluginSkillLocation[] = [];

  for (const mkt of safeReaddir(marketplacesRoot)) {
    const mktPath = join(marketplacesRoot, mkt.name);
    if (!isDirectory(mktPath)) continue;

    const pluginsRoot = join(mktPath, 'plugins');
    if (!existsSync(pluginsRoot)) continue;

    for (const plugin of safeReaddir(pluginsRoot)) {
      const pluginPath = join(pluginsRoot, plugin.name);
      if (!isDirectory(pluginPath)) continue;

      const skillsDir = join(pluginPath, 'skills');
      if (!existsSync(skillsDir)) continue;

      for (const skillEntry of safeReaddir(skillsDir)) {
        const skillDir = join(skillsDir, skillEntry.name);
        if (!isDirectory(skillDir)) continue;
        out.push({
          marketplaceName: mkt.name,
          pluginName: plugin.name,
          skillName: skillEntry.name,
          skillDir,
        });
      }
    }
  }
  return out;
}

export function resolvePluginSkillDir(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
): string {
  return join(
    homedir(),
    '.claude',
    'plugins',
    'marketplaces',
    marketplaceName,
    'plugins',
    pluginName,
    'skills',
    skillName,
  );
}

function scanDirectory(dirPath: string, basePath: string): SkillFileEntry[] {
  const entries = safeReaddir(dirPath);
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
    projectId: 'claude-plugin',
    skillPath: loc.skillDir,
    content,
    hasEvals: existsSync(join(loc.skillDir, 'evals')),
    hasReferences: existsSync(join(loc.skillDir, 'references')),
    hasTemplates: existsSync(join(loc.skillDir, 'templates')),
    files: scanDirectory(loc.skillDir, loc.skillDir),
    evals: parseSkillEvals(loc.skillDir, loc.skillName),
    auditCount: countAudits(loc.skillDir),
    pluginName: loc.pluginName,
    marketplaceName: loc.marketplaceName,
  };
}

export function listPluginSkills(): Skill[] {
  const skills = listPluginSkillLocations().map(buildSkill);
  skills.sort((a, b) => {
    const m = (a.marketplaceName ?? '').localeCompare(b.marketplaceName ?? '');
    if (m !== 0) return m;
    const p = (a.pluginName ?? '').localeCompare(b.pluginName ?? '');
    if (p !== 0) return p;
    return a.name.localeCompare(b.name);
  });
  return skills;
}

function findLocation(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
): PluginSkillLocation | undefined {
  return listPluginSkillLocations().find(
    (l) =>
      l.marketplaceName === marketplaceName &&
      l.pluginName === pluginName &&
      l.skillName === skillName,
  );
}

export function readPluginSkill(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
): Skill | null {
  const loc = findLocation(marketplaceName, pluginName, skillName);
  if (!loc) return null;
  return buildSkill(loc);
}

export function readPluginSkillFile(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
  relativePath: string,
): string | null {
  const loc = findLocation(marketplaceName, pluginName, skillName);
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
  marketplaceName: string,
  pluginName: string,
  skillName: string,
  relativePath: string,
  content: string,
): void {
  const loc = findLocation(marketplaceName, pluginName, skillName);
  if (!loc) return;
  const filePath = join(loc.skillDir, relativePath);
  if (!filePath.startsWith(loc.skillDir)) return;
  writeFileSync(filePath, content, 'utf8');
}
