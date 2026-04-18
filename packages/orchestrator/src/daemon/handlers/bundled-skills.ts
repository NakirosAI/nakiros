import {
  listBundledSkills,
  readBundledSkill,
  readBundledSkillFile,
  saveBundledSkillFile,
} from '../../services/bundled-skills-reader.js';
import { promoteBundledSkill } from '../../services/bundled-skills-sync.js';
import type { HandlerRegistry } from './index.js';

export const bundledSkillsHandlers: HandlerRegistry = {
  'nakiros:listBundledSkills': () => listBundledSkills(),
  'nakiros:getBundledSkill': (args) => readBundledSkill(args[0] as string),
  'nakiros:readBundledSkillFile': (args) =>
    readBundledSkillFile(args[0] as string, args[1] as string),
  'nakiros:saveBundledSkillFile': (args) => {
    saveBundledSkillFile(args[0] as string, args[1] as string, args[2] as string);
  },
  'nakiros:promoteBundledSkill': (args) => promoteBundledSkill(args[0] as string),
};
