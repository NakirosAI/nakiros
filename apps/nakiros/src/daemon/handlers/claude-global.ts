import {
  listClaudeGlobalSkills,
  readClaudeGlobalSkill,
  readClaudeGlobalSkillFile,
  saveClaudeGlobalSkillFile,
} from '../../services/claude-global-skills-reader.js';
import type { HandlerRegistry } from './index.js';

export const claudeGlobalHandlers: HandlerRegistry = {
  'claudeGlobal:listSkills': () => listClaudeGlobalSkills(),
  'claudeGlobal:getSkill': (args) => readClaudeGlobalSkill(args[0] as string),
  'claudeGlobal:readSkillFile': (args) =>
    readClaudeGlobalSkillFile(args[0] as string, args[1] as string),
  'claudeGlobal:saveSkillFile': (args) => {
    saveClaudeGlobalSkillFile(args[0] as string, args[1] as string, args[2] as string);
  },
};
