import {
  listPluginSkills,
  readPluginSkill,
  readPluginSkillFile,
  savePluginSkillFile,
} from '../../services/plugin-skills-reader.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `pluginSkills:*` IPC channels — CRUD on plugin-provided skills under
 * `~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin>/skills/` plus project-local plugins.
 *
 * Channels:
 * - `pluginSkills:list` — lists every plugin skill across every discovered marketplace
 * - `pluginSkills:getSkill` — reads one skill's SKILL.md + tree
 * - `pluginSkills:readSkillFile` — reads a relative file inside a plugin skill
 * - `pluginSkills:saveSkillFile` — overwrites a file inside a plugin skill
 */
export const pluginSkillsHandlers: HandlerRegistry = {
  'pluginSkills:list': () => listPluginSkills(),
  'pluginSkills:getSkill': (args) =>
    readPluginSkill(args[0] as string, args[1] as string, args[2] as string),
  'pluginSkills:readSkillFile': (args) =>
    readPluginSkillFile(
      args[0] as string,
      args[1] as string,
      args[2] as string,
      args[3] as string,
    ),
  'pluginSkills:saveSkillFile': (args) => {
    savePluginSkillFile(
      args[0] as string,
      args[1] as string,
      args[2] as string,
      args[3] as string,
      args[4] as string,
    );
  },
};
