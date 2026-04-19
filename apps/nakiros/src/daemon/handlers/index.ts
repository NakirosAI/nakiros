import type { IpcChannel } from '@nakiros/shared';
import { preferencesHandlers } from './preferences.js';
import { shellHandlers } from './shell.js';
import { metaHandlers } from './meta.js';
import { projectHandlers } from './projects.js';
import { bundledSkillsHandlers } from './bundled-skills.js';
import { claudeGlobalHandlers } from './claude-global.js';
import { skillsCommonHandlers } from './skills-common.js';
import { agentsHandlers } from './agents.js';
import { onboardingHandlers } from './onboarding.js';
import { evalHandlers } from './eval.js';
import { auditHandlers } from './audit.js';
import { fixHandlers } from './fix.js';
import { createHandlers } from './create.js';
import { skillAgentHandlers } from './skill-agent.js';

export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

export type HandlerRegistry = Partial<Record<IpcChannel, IpcHandler>>;

export function buildHandlerRegistry(): HandlerRegistry {
  return {
    ...preferencesHandlers,
    ...shellHandlers,
    ...metaHandlers,
    ...projectHandlers,
    ...bundledSkillsHandlers,
    ...claudeGlobalHandlers,
    ...skillsCommonHandlers,
    ...agentsHandlers,
    ...onboardingHandlers,
    ...evalHandlers,
    ...auditHandlers,
    ...fixHandlers,
    ...createHandlers,
    ...skillAgentHandlers,
  };
}
