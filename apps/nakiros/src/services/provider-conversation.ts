import type {
  ConversationMessage,
  NormalizedConversation,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

export function isCodexAnalysis(
  analysis: ProviderConversationAnalysis,
): analysis is Extract<ProviderConversationAnalysis, { provider: 'codex' }> {
  return 'provider' in analysis && analysis.provider === 'codex';
}

/**
 * Build the provider-neutral conversation contract consumed by Argos modules.
 * Provider adapters keep their native metrics in `analysis`; downstream code
 * no longer needs to know how either JSONL format represents messages.
 */
export function normalizeProviderConversation(
  analysis: ProviderConversationAnalysis,
  messages: ConversationMessage[],
): NormalizedConversation {
  const provider = isCodexAnalysis(analysis) ? 'codex' : 'claude';
  return {
    provider,
    sessionId: analysis.sessionId,
    projectId: analysis.projectId,
    startedAt: analysis.startedAt,
    lastMessageAt: analysis.lastMessageAt,
    durationMs: analysis.durationMs,
    messageCount: analysis.messageCount,
    summary: analysis.summary,
    gitBranch: analysis.gitBranch,
    messages: messages.map((message) => ({
      ...message,
      provider: message.provider ?? provider,
    })),
    frictionPoints: analysis.frictionPoints,
    analysis,
  };
}
