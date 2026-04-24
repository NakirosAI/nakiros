import {
  listClaudeGlobalSkills,
  readClaudeGlobalSkill,
  readClaudeGlobalSkillFile,
  saveClaudeGlobalSkillFile,
} from '../../services/claude-global-skills-reader.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `claudeGlobal:*` IPC channels — CRUD on user-global skills under
 * `~/.claude/skills/` (excluding Nakiros symlinks).
 *
 * Channels:
 * - `claudeGlobal:listSkills` — returns every non-Nakiros skill under `~/.claude/skills`
 * - `claudeGlobal:getSkill` — reads one skill's SKILL.md + tree
 * - `claudeGlobal:readSkillFile` — reads a relative file inside a skill
 * - `claudeGlobal:saveSkillFile` — overwrites a file inside a skill
 */
export const claudeGlobalHandlers: HandlerRegistry = {
  'claudeGlobal:listSkills': () => listClaudeGlobalSkills(),
  'claudeGlobal:getSkill': (args) => readClaudeGlobalSkill(args[0] as string),
  'claudeGlobal:readSkillFile': (args) =>
    readClaudeGlobalSkillFile(args[0] as string, args[1] as string),
  'claudeGlobal:saveSkillFile': (args) => {
    saveClaudeGlobalSkillFile(args[0] as string, args[1] as string, args[2] as string);
  },
};
