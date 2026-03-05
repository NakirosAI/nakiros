export type AgentGroup = 'meta' | 'agent' | 'workflow';
export type AgentKind = 'agent' | 'workflow';

export interface AgentDefinition {
  id: string;
  label: string;
  labelKey: string;
  command: string;
  /** 'meta' = nakiros orchestrator, 'agent' = specialized agent, 'workflow' = slash command workflow */
  group: AgentGroup;
  /** Derived: meta/agent → 'agent', workflow → 'workflow' */
  kind: AgentKind;
  placeholder: string;
  placeholderKey: string;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  { id: 'nakiros', label: 'Nakiros', labelKey: 'definitions.nakiros.label', command: '/nak-agent-nakiros', group: 'meta', kind: 'agent', placeholder: 'Talk with Nakiros…', placeholderKey: 'definitions.nakiros.placeholder' },
  { id: 'dev', label: 'Dev Agent', labelKey: 'definitions.dev.label', command: '/nak-agent-dev', group: 'agent', kind: 'agent', placeholder: 'Message for Dev Agent…', placeholderKey: 'definitions.dev.placeholder' },
  { id: 'pm', label: 'PM Agent', labelKey: 'definitions.pm.label', command: '/nak-agent-pm', group: 'agent', kind: 'agent', placeholder: 'Message for PM Agent…', placeholderKey: 'definitions.pm.placeholder' },
  { id: 'architect', label: 'Architect', labelKey: 'definitions.architect.label', command: '/nak-agent-architect', group: 'agent', kind: 'agent', placeholder: 'Message for Architect…', placeholderKey: 'definitions.architect.placeholder' },
  { id: 'sm', label: 'SM Agent', labelKey: 'definitions.sm.label', command: '/nak-agent-sm', group: 'agent', kind: 'agent', placeholder: 'Message for SM Agent…', placeholderKey: 'definitions.sm.placeholder' },
  { id: 'qa', label: 'QA Agent', labelKey: 'definitions.qa.label', command: '/nak-agent-qa', group: 'agent', kind: 'agent', placeholder: 'Message for QA Agent…', placeholderKey: 'definitions.qa.placeholder' },
  { id: 'hotfix', label: 'Hotfix Agent', labelKey: 'definitions.hotfix.label', command: '/nak-agent-hotfix', group: 'agent', kind: 'agent', placeholder: 'Message for Hotfix Agent…', placeholderKey: 'definitions.hotfix.placeholder' },
  { id: 'brainstorming', label: 'Brainstorming', labelKey: 'definitions.brainstorming.label', command: '/nak-agent-brainstorming', group: 'agent', kind: 'agent', placeholder: 'Message for Brainstorming…', placeholderKey: 'definitions.brainstorming.placeholder' },
  { id: 'dev-story', label: 'Dev Story', labelKey: 'definitions.dev-story.label', command: '/nak-workflow-dev-story', group: 'workflow', kind: 'workflow', placeholder: 'Ticket ID (e.g. EX-203)', placeholderKey: 'definitions.dev-story.placeholder' },
  { id: 'create-story', label: 'Create Story', labelKey: 'definitions.create-story.label', command: '/nak-workflow-create-story', group: 'workflow', kind: 'workflow', placeholder: 'Describe the story to create…', placeholderKey: 'definitions.create-story.placeholder' },
  { id: 'create-ticket', label: 'Create Ticket', labelKey: 'definitions.create-ticket.label', command: '/nak-workflow-create-ticket', group: 'workflow', kind: 'workflow', placeholder: 'Describe the ticket to create…', placeholderKey: 'definitions.create-ticket.placeholder' },
  { id: 'generate-context', label: 'Generate Context', labelKey: 'definitions.generate-context.label', command: '/nak-workflow-generate-context', group: 'workflow', kind: 'workflow', placeholder: 'Run Generate Context on this workspace?', placeholderKey: 'definitions.generate-context.placeholder' },
  { id: 'project-confidence', label: 'Project Confidence', labelKey: 'definitions.project-confidence.label', command: '/nak-workflow-project-understanding-confidence', group: 'workflow', kind: 'workflow', placeholder: 'Evaluate project confidence?', placeholderKey: 'definitions.project-confidence.placeholder' },
  { id: 'qa-review', label: 'QA Review', labelKey: 'definitions.qa-review.label', command: '/nak-workflow-qa-review', group: 'workflow', kind: 'workflow', placeholder: 'Run QA Review?', placeholderKey: 'definitions.qa-review.placeholder' },
  { id: 'hotfix-story', label: 'Hotfix Story', labelKey: 'definitions.hotfix-story.label', command: '/nak-workflow-hotfix-story', group: 'workflow', kind: 'workflow', placeholder: 'Hotfix ticket ID (e.g. EX-203)', placeholderKey: 'definitions.hotfix-story.placeholder' },
  { id: 'sprint-planning', label: 'Sprint Planning', labelKey: 'definitions.sprint-planning.label', command: '/nak-workflow-sprint', group: 'workflow', kind: 'workflow', placeholder: 'Run Sprint Planning?', placeholderKey: 'definitions.sprint-planning.placeholder' },
  { id: 'fetch-project-context', label: 'Fetch Project Context', labelKey: 'definitions.fetch-project-context.label', command: '/nak-workflow-fetch-project-context', group: 'workflow', kind: 'workflow', placeholder: 'Run Fetch Project Context?', placeholderKey: 'definitions.fetch-project-context.placeholder' },
];

/** Lookup: command → label (fallback for conversation title) */
export const COMMAND_LABEL_MAP: Record<string, string> = Object.fromEntries(
  AGENT_DEFINITIONS.map((a) => [a.command, a.label]),
);

/** Couleurs par label d'agent (utilisé dans AgentPanel pour le rendu multi-agent) */
export const AGENT_COLORS: Record<string, { accent: string; bg: string }> = {
  Nakiros: { accent: '#0D9E9E', bg: 'rgba(13,158,158,0.07)' },
  PM: { accent: '#7C3AED', bg: 'rgba(124,58,237,0.07)' },
  Architect: { accent: '#2563EB', bg: 'rgba(37,99,235,0.07)' },
  Dev: { accent: '#16A34A', bg: 'rgba(22,163,74,0.07)' },
  SM: { accent: '#D97706', bg: 'rgba(217,119,6,0.07)' },
  QA: { accent: '#DC2626', bg: 'rgba(220,38,38,0.07)' },
  Hotfix: { accent: '#B91C1C', bg: 'rgba(185,28,28,0.07)' },
  Brainstorming: { accent: '#DB2777', bg: 'rgba(219,39,119,0.07)' },
};
