/**
 * Templates bundled at build time via Vite ?raw imports.
 * Allows the packaged Electron app to install CLI commands
 * without requiring apps/cli/ to be present at runtime.
 */

import tiqAgentDev from '../../cli/templates/commands/tiq-agent-dev.md?raw';
import tiqAgentSm from '../../cli/templates/commands/tiq-agent-sm.md?raw';
import tiqAgentPm from '../../cli/templates/commands/tiq-agent-pm.md?raw';
import tiqAgentArchitect from '../../cli/templates/commands/tiq-agent-architect.md?raw';
import tiqAgentBrainstorming from '../../cli/templates/commands/tiq-agent-brainstorming.md?raw';
import tiqAgentQa from '../../cli/templates/commands/tiq-agent-qa.md?raw';
import tiqAgentHotfix from '../../cli/templates/commands/tiq-agent-hotfix.md?raw';
import tiqWorkflowCreateStory from '../../cli/templates/commands/tiq-workflow-create-story.md?raw';
import tiqWorkflowDevStory from '../../cli/templates/commands/tiq-workflow-dev-story.md?raw';
import tiqWorkflowFetchProjectContext from '../../cli/templates/commands/tiq-workflow-fetch-project-context.md?raw';
import tiqWorkflowGenerateContext from '../../cli/templates/commands/tiq-workflow-generate-context.md?raw';
import tiqWorkflowCreateTicket from '../../cli/templates/commands/tiq-workflow-create-ticket.md?raw';
import tiqWorkflowHotfixStory from '../../cli/templates/commands/tiq-workflow-hotfix-story.md?raw';
import tiqWorkflowQaReview from '../../cli/templates/commands/tiq-workflow-qa-review.md?raw';
import tiqWorkflowSprint from '../../cli/templates/commands/tiq-workflow-sprint.md?raw';

export const COMMAND_TEMPLATES: Record<string, string> = {
  'tiq-agent-dev.md': tiqAgentDev,
  'tiq-agent-sm.md': tiqAgentSm,
  'tiq-agent-pm.md': tiqAgentPm,
  'tiq-agent-architect.md': tiqAgentArchitect,
  'tiq-agent-brainstorming.md': tiqAgentBrainstorming,
  'tiq-agent-qa.md': tiqAgentQa,
  'tiq-agent-hotfix.md': tiqAgentHotfix,
  'tiq-workflow-create-story.md': tiqWorkflowCreateStory,
  'tiq-workflow-dev-story.md': tiqWorkflowDevStory,
  'tiq-workflow-fetch-project-context.md': tiqWorkflowFetchProjectContext,
  'tiq-workflow-generate-context.md': tiqWorkflowGenerateContext,
  'tiq-workflow-create-ticket.md': tiqWorkflowCreateTicket,
  'tiq-workflow-hotfix-story.md': tiqWorkflowHotfixStory,
  'tiq-workflow-qa-review.md': tiqWorkflowQaReview,
  'tiq-workflow-sprint.md': tiqWorkflowSprint,
};
