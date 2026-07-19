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
import { editHandlers } from './edit.js';
import { skillAgentHandlers } from './skill-agent.js';
import { analyzeConvoHandlers } from './analyze-convo.js';
import { classifyConvoHandlers } from './classify-convo.js';
import { claudeConfigHandlers } from './claude-config.js';
import { claudeRulesHandlers } from './claude-rules.js';
import { claudeAgentsHandlers } from './claude-agents.js';
import { claudeOutputStylesHandlers } from './claude-output-styles.js';
import { claudePermissionsHandlers } from './claude-permissions.js';
import { claudeMcpHandlers } from './claude-mcp.js';
import { claudeHooksHandlers } from './claude-hooks.js';
import { claudeMdHandlers } from './claude-md.js';
import { rulesHandlers } from './rules.js';
import { subagentsHandlers } from './subagents.js';
import { hooksHandlers } from './hooks.js';
import { permissionsHandlers } from './permissions.js';
import { mcpHandlers } from './mcp.js';
import { outputStylesHandlers } from './output-styles.js';
import { conversationIngestHandlers } from './conversation-ingest.js';
import { driftHookHandlers } from './drift-hook.js';
import { recommendationsHandlers } from './recommendations.js';
import { bootstrapHandlers } from './bootstrap.js';
import { codexConfigHandlers } from './codex-config.js';
import { codexResourceHandlers } from './codex-resources.js';

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
    ...editHandlers,
    ...skillAgentHandlers,
    ...analyzeConvoHandlers,
    ...classifyConvoHandlers,
    ...claudeConfigHandlers,
    ...claudeRulesHandlers,
    ...claudeAgentsHandlers,
    ...claudeOutputStylesHandlers,
    ...claudePermissionsHandlers,
    ...claudeMcpHandlers,
    ...claudeHooksHandlers,
    ...claudeMdHandlers,
    ...rulesHandlers,
    ...subagentsHandlers,
    ...hooksHandlers,
    ...permissionsHandlers,
    ...mcpHandlers,
    ...outputStylesHandlers,
    ...conversationIngestHandlers,
    ...driftHookHandlers,
    ...recommendationsHandlers,
    ...bootstrapHandlers,
    ...codexConfigHandlers,
    ...codexResourceHandlers,
  };
}
