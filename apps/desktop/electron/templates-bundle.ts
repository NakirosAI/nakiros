/**
 * Templates bundled at build time via Vite ?raw imports.
 */

import AgentNakiros from '../templates/commands/nak-agent-nakiros.md?raw';
import AgentDev from '../templates/commands/nak-agent-dev.md?raw';
import AgentSm from '../templates/commands/nak-agent-sm.md?raw';
import AgentPm from '../templates/commands/nak-agent-pm.md?raw';
import AgentArchitect from '../templates/commands/nak-agent-architect.md?raw';
import AgentBrainstorming from '../templates/commands/nak-agent-brainstorming.md?raw';
import AgentQa from '../templates/commands/nak-agent-qa.md?raw';
import AgentHotfix from '../templates/commands/nak-agent-hotfix.md?raw';
import WorkflowCreateStory from '../templates/commands/nak-workflow-create-story.md?raw';
import WorkflowDevStory from '../templates/commands/nak-workflow-dev-story.md?raw';
import WorkflowFetchProjectContext from '../templates/commands/nak-workflow-fetch-project-context.md?raw';
import WorkflowGenerateContext from '../templates/commands/nak-workflow-generate-context.md?raw';
import WorkflowCreateTicket from '../templates/commands/nak-workflow-create-ticket.md?raw';
import WorkflowHotfixStory from '../templates/commands/nak-workflow-hotfix-story.md?raw';
import WorkflowQaReview from '../templates/commands/nak-workflow-qa-review.md?raw';
import WorkflowSprint from '../templates/commands/nak-workflow-sprint.md?raw';
import WorkflowProjectUnderstandingConfidence from '../templates/commands/nak-workflow-project-understanding-confidence.md?raw';

export const COMMAND_TEMPLATES: Record<string, string> = {
  'nak-agent-nakiros.md': AgentNakiros,
  'nak-agent-dev.md': AgentDev,
  'nak-agent-sm.md': AgentSm,
  'nak-agent-pm.md': AgentPm,
  'nak-agent-architect.md': AgentArchitect,
  'nak-agent-brainstorming.md': AgentBrainstorming,
  'nak-agent-qa.md': AgentQa,
  'nak-agent-hotfix.md': AgentHotfix,
  'nak-workflow-create-story.md': WorkflowCreateStory,
  'nak-workflow-dev-story.md': WorkflowDevStory,
  'nak-workflow-fetch-project-context.md': WorkflowFetchProjectContext,
  'nak-workflow-generate-context.md': WorkflowGenerateContext,
  'nak-workflow-create-ticket.md': WorkflowCreateTicket,
  'nak-workflow-hotfix-story.md': WorkflowHotfixStory,
  'nak-workflow-qa-review.md': WorkflowQaReview,
  'nak-workflow-sprint.md': WorkflowSprint,
  'nak-workflow-project-understanding-confidence.md': WorkflowProjectUnderstandingConfidence,
};
