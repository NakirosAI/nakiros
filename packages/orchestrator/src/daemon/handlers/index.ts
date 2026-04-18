import type { IpcChannel } from '@nakiros/shared';
import { preferencesHandlers } from './preferences.js';
import { projectHandlers } from './projects.js';
import { bundledSkillsHandlers } from './bundled-skills.js';
import { claudeGlobalHandlers } from './claude-global.js';
import { skillsCommonHandlers } from './skills-common.js';
import { agentsHandlers } from './agents.js';
import { onboardingHandlers } from './onboarding.js';
import { serverStatusHandlers } from './server-status.js';

export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

export type HandlerRegistry = Partial<Record<IpcChannel, IpcHandler>>;

export function buildHandlerRegistry(): HandlerRegistry {
  return {
    ...preferencesHandlers,
    ...projectHandlers,
    ...bundledSkillsHandlers,
    ...claudeGlobalHandlers,
    ...skillsCommonHandlers,
    ...agentsHandlers,
    ...onboardingHandlers,
    ...serverStatusHandlers,
  };
}
