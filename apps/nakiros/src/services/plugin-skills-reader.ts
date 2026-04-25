import { existsSync } from 'fs';
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

/**
 * Claude Code clones each plugin marketplace to
 * ~/.claude/plugins/marketplaces/<marketplace>/ and the plugins themselves
 * live at <marketplace>/plugins/<plugin>/, with skills under
 * <plugin>/skills/<skill>/SKILL.md. Not every plugin ships skills (some only
 * have agents/ or commands/), so we tolerate missing skills/ dirs silently.
 */
/** Fully-qualified location of a plugin skill: marketplace / plugin / skill / absolute dir. */
export interface PluginSkillLocation {
  marketplaceName: string;
  pluginName: string;
  skillName: string;
  skillDir: string;
}

const PLUGIN_PROJECT_ID = 'claude-plugin';

/**
 * Walk `~/.claude/plugins/marketplaces/<mkt>/plugins/<plugin>/skills/` and
 * return every plugin skill found. Missing `skills/` directories are skipped
 * silently (plugins without skills are legitimate).
 */
export function listPluginSkillLocations(): PluginSkillLocation[] {
  const marketplacesRoot = join(homedir(), '.claude', 'plugins', 'marketplaces');
  if (!existsSync(marketplacesRoot)) return [];

  const out: PluginSkillLocation[] = [];

  for (const mkt of safeReaddir(marketplacesRoot)) {
    const mktPath = join(marketplacesRoot, mkt.name);
    if (!isDirectoryStat(mktPath)) continue;

    const pluginsRoot = join(mktPath, 'plugins');
    if (!existsSync(pluginsRoot)) continue;

    for (const plugin of safeReaddir(pluginsRoot)) {
      const pluginPath = join(pluginsRoot, plugin.name);
      if (!isDirectoryStat(pluginPath)) continue;

      const skillsDir = join(pluginPath, 'skills');
      if (!existsSync(skillsDir)) continue;

      for (const skillEntry of safeReaddir(skillsDir)) {
        const skillDir = join(skillsDir, skillEntry.name);
        if (!isDirectoryStat(skillDir)) continue;
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

/**
 * Build the absolute path to a plugin skill given `(marketplace, plugin, skill)`.
 * Exposed so other modules can resolve plugin skills without walking the tree.
 */
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

function buildPluginSkill(loc: PluginSkillLocation): Skill {
  return buildSkillRecord({
    skillDir: loc.skillDir,
    skillName: loc.skillName,
    projectId: PLUGIN_PROJECT_ID,
    extras: {
      pluginName: loc.pluginName,
      marketplaceName: loc.marketplaceName,
    },
  });
}

/** List every plugin skill sorted by `(marketplace, plugin, skill)`. */
export function listPluginSkills(): Skill[] {
  const skills = listPluginSkillLocations().map(buildPluginSkill);
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

/** Read one plugin skill by `(marketplace, plugin, skill)`. Returns `null` when unknown. */
export function readPluginSkill(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
): Skill | null {
  const loc = findLocation(marketplaceName, pluginName, skillName);
  if (!loc) return null;
  return buildPluginSkill(loc);
}

/** Read an arbitrary file inside a plugin skill. Refuses path-traversal; returns `null` on miss. */
export function readPluginSkillFile(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
  relativePath: string,
): string | null {
  const loc = findLocation(marketplaceName, pluginName, skillName);
  if (!loc) return null;
  return readSkillFileSafe(loc.skillDir, relativePath);
}

/** Write an arbitrary file inside a plugin skill. Refuses path-traversal silently. */
export function savePluginSkillFile(
  marketplaceName: string,
  pluginName: string,
  skillName: string,
  relativePath: string,
  content: string,
): void {
  const loc = findLocation(marketplaceName, pluginName, skillName);
  if (!loc) return;
  writeSkillFileSafe(loc.skillDir, relativePath, content);
}
