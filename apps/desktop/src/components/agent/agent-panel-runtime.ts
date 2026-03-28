import type { AgentProvider, StoredRepo } from '@nakiros/shared';
import type {
  Message,
  OrchestrationParticipantBlock,
} from './agent-panel-utils.js';

export interface OrchestrationParticipantResult {
  agent: string;
  provider: AgentProvider;
  content: string;
  summary: string;
}

export interface OrchestrationExecution {
  id: string;
  tabId: string;
  sourceParticipantId: string | null;
  sourceProvider: AgentProvider;
  sourceAgentId: string;
  sourceVisibleContent: string;
  sharedScope: string;
  sharedRepos: string[];
  userGoal: string;
  synthesisGoal: string;
  pendingParticipants: OrchestrationParticipantBlock[];
  completedParticipants: OrchestrationParticipantResult[];
  parallel: boolean;
  parallelPendingCount: number;
}

export type AgentPanelStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'session'; id: string };

export function collectAdditionalDirs(repos: StoredRepo[]): string[] {
  return Array.from(new Set(
    repos.map((repo) => repo.localPath).filter((path) => path.trim().length > 0),
  ));
}

export function createStreamingAgentMessage(runId: string, agentId: string | null = null): Message {
  return {
    id: `agent-${runId}`,
    role: 'agent',
    agentId,
    content: '',
    status: 'streaming',
    tools: [],
  };
}

export function createAgentErrorMessage(content: string, agentId: string | null = null): Message {
  return {
    id: `agent-error-${Date.now()}`,
    role: 'agent',
    agentId,
    content,
    status: 'error',
    tools: [],
  };
}

export function resolveParticipantProvider(
  participantId: string | null,
  fallbackProvider: AgentProvider,
): AgentProvider {
  return (participantId?.split(':')[1] ?? fallbackProvider) as AgentProvider;
}

export function resolveParticipantAgentId(
  participantId: string | null,
  fallbackAgentId = 'agent',
): string {
  return participantId?.split(':')[0] ?? fallbackAgentId;
}

export function buildActionResultSummary(tool: string, args: Record<string, string>, resultJson: string): string {
  const ticketId = args['ticket_id'] ?? args['issue_id'] ?? '';
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    const key = (parsed['key'] ?? parsed['id'] ?? ticketId) as string;
    if (tool === 'create_ticket') return `↳ ${tool} · ${key} created`;
    if (tool === 'get_ticket') {
      const title = typeof parsed['summary'] === 'string'
        ? parsed['summary']
        : (typeof parsed['title'] === 'string' ? parsed['title'] : '');
      const truncated = title.length > 50 ? `${title.slice(0, 50)}…` : title;
      return `↳ ${tool} · ${key}${truncated ? ` · ${truncated}` : ''}`;
    }
    if (tool === 'update_ticket_status') {
      const status = (parsed['status'] ?? parsed['state'] ?? args['status'] ?? '') as string;
      return `↳ ${tool} · ${ticketId}${status ? ` → ${status}` : ''}`;
    }
    if (tool === 'add_comment') return `↳ ${tool} · ${ticketId} · comment added`;
  } catch {
    // fallback below
  }
  return `↳ ${tool}${ticketId ? ` · ${ticketId}` : ''}`;
}
