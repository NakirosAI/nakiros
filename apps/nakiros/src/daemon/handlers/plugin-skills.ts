import {
  listPluginSkills,
  readPluginSkill,
  readPluginSkillFile,
  savePluginSkillFile,
} from '../../services/plugin-skills-reader.js';
import type { HandlerRegistry } from './index.js';

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
