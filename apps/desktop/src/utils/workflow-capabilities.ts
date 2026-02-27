export type WorkflowCapabilityStatus = 'stable' | 'beta';

export interface WorkflowCapability {
  id: 'dev-story' | 'generate-context' | 'create-ticket' | 'create-story' | 'fetch-project-context' | 'qa-review';
  label: string;
  command: string;
  status: WorkflowCapabilityStatus;
  fallbackMessage: string;
}

export const WORKFLOW_CAPABILITIES: WorkflowCapability[] = [
  {
    id: 'dev-story',
    label: 'Dev Story',
    command: '/tiq-workflow-dev-story',
    status: 'stable',
    fallbackMessage: '',
  },
  {
    id: 'generate-context',
    label: 'Generate Context',
    command: '/tiq-workflow-generate-context',
    status: 'stable',
    fallbackMessage: '',
  },
  {
    id: 'create-ticket',
    label: 'Create Ticket',
    command: '/tiq:workflow:create-ticket',
    status: 'beta',
    fallbackMessage: 'Workflow visible en Beta. Si indisponible, utilise le board local et affine le ticket avec un agent PM.',
  },
  {
    id: 'create-story',
    label: 'Create Story',
    command: '/tiq:workflow:create-story',
    status: 'beta',
    fallbackMessage: 'Workflow visible en Beta. Si indisponible, crée une story depuis un ticket existant et valide les AC manuellement.',
  },
  {
    id: 'fetch-project-context',
    label: 'Fetch Project Context',
    command: '/tiq:workflow:fetch-project-context',
    status: 'beta',
    fallbackMessage: 'Workflow visible en Beta. Si indisponible, utilise Generate Context puis complète avec Contexte PM.',
  },
  {
    id: 'qa-review',
    label: 'QA Review',
    command: '/tiq:workflow:qa-review',
    status: 'beta',
    fallbackMessage: 'Workflow visible en Beta. Si indisponible, lance un agent QA et utilise la checklist DoD locale.',
  },
];
