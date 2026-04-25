import type { IpcChannel } from '@nakiros/shared';
import { preferencesHandlers } from './preferences.js';
import { shellHandlers } from './shell.js';
import { metaHandlers } from './meta.js';
import { projectHandlers } from './projects.js';
import { bundledSkillsHandlers } from './bundled-skills.js';
import { claudeGlobalHandlers } from './claude-global.js';
import { pluginSkillsHandlers } from './plugin-skills.js';
import { skillsCommonHandlers } from './skills-common.js';
import { agentsHandlers } from './agents.js';
import { onboardingHandlers } from './onboarding.js';
import { evalHandlers } from './eval.js';
import { comparisonHandlers } from './comparison.js';
import { auditHandlers } from './audit.js';
import { fixHandlers } from './fix.js';
import { createHandlers } from './create.js';
import { skillAgentHandlers } from './skill-agent.js';

/** Signature every IPC handler must implement — takes an arg array, returns a value or promise. */
export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

/**
 * Handler registry shape: a partial record keyed by {@link IpcChannel}. Partial
 * because individual handler files only register the channels they own; the
 * final registry merges them all.
 */
export type HandlerRegistry = Partial<Record<IpcChannel, IpcHandler>>;

/**
 * Merge every domain-scoped handler bundle into the final registry consumed by
 * `POST /ipc/:channel`. Add a new `*.ts` under `handlers/` and its handler map
 * here when introducing new IPC channels.
 */
export function buildHandlerRegistry(): HandlerRegistry {
  return {
    ...preferencesHandlers,
    ...shellHandlers,
    ...metaHandlers,
    ...projectHandlers,
    ...bundledSkillsHandlers,
    ...claudeGlobalHandlers,
    ...pluginSkillsHandlers,
    ...skillsCommonHandlers,
    ...agentsHandlers,
    ...onboardingHandlers,
    ...evalHandlers,
    ...comparisonHandlers,
    ...auditHandlers,
    ...fixHandlers,
    ...createHandlers,
    ...skillAgentHandlers,
  };
}
