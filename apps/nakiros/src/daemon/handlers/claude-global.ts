import {
  listClaudeGlobalSkills,
  readClaudeGlobalSkill,
  readClaudeGlobalSkillFile,
  saveClaudeGlobalSkillFile,
} from '../../services/claude-global-skills-reader.js';
import { createTypedHandler } from './run-helpers.js';
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
  'claudeGlobal:listSkills': createTypedHandler(listClaudeGlobalSkills),
  'claudeGlobal:getSkill': createTypedHandler(readClaudeGlobalSkill),
  'claudeGlobal:readSkillFile': createTypedHandler(readClaudeGlobalSkillFile),
  'claudeGlobal:saveSkillFile': createTypedHandler(saveClaudeGlobalSkillFile),
};
