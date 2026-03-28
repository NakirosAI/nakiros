import type { AgentProvider, ConversationParticipant } from '@nakiros/shared';

export function normalizeProvider(value: unknown): AgentProvider {
  if (value === 'codex' || value === 'cursor' || value === 'claude') return value;
  return 'claude';
}

export function toWorkspaceSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

export function normalizeParticipants(raw: unknown, fallbackRepoPath: string): ConversationParticipant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (
      typeof item['participantId'] !== 'string'
      || typeof item['agentId'] !== 'string'
      || typeof item['lastUsedAt'] !== 'string'
    ) return [];

    return [{
      participantId: item['participantId'],
      agentId: item['agentId'],
      provider: normalizeProvider(item['provider']),
      providerSessionId: typeof item['providerSessionId'] === 'string'
        ? item['providerSessionId']
        : (typeof item['sessionId'] === 'string' ? item['sessionId'] : null),
      sessionId: typeof item['providerSessionId'] === 'string'
        ? item['providerSessionId']
        : (typeof item['sessionId'] === 'string' ? item['sessionId'] : null),
      conversationId: typeof item['conversationId'] === 'string' ? item['conversationId'] : null,
      anchorRepoPath: typeof item['anchorRepoPath'] === 'string' ? item['anchorRepoPath'] : fallbackRepoPath,
      activeRepoPaths: Array.isArray(item['activeRepoPaths'])
        ? item['activeRepoPaths'].filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        : (fallbackRepoPath ? [fallbackRepoPath] : []),
      summary: typeof item['summary'] === 'string' ? item['summary'] : '',
      openQuestions: Array.isArray(item['openQuestions'])
        ? item['openQuestions'].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
      lastUsedAt: item['lastUsedAt'],
      status: item['status'] === 'running' || item['status'] === 'waiting' || item['status'] === 'error'
        ? item['status']
        : 'idle',
    }];
  });
}
