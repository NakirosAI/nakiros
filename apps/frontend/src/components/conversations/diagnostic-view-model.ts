import type {
  ConversationDrift,
  ConversationTip,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

import { isCodexConversationAnalysis } from '../../hooks/useConversationAnalyses';

export interface DiagnosticTool {
  name: string;
  count: number;
  errorCount: number;
}

export type DiagnosticRecommendation =
  | { kind: 'tip'; tip: ConversationTip }
  | { kind: 'factor'; signal: string; count: number; penalty: number };

export interface ConversationDiagnosticViewModel {
  provider: 'claude' | 'codex';
  overview: string;
  durationMs: number;
  messageCount: number;
  maxContextTokens: number | null;
  contextWindow: number | null;
  totalTokens: number | null;
  compactionCount: number;
  frictionCount: number;
  toolErrorCount: number;
  tools: DiagnosticTool[];
  hotFiles: Array<{ path: string; editCount: number }>;
  recommendations: DiagnosticRecommendation[];
  drift: ConversationDrift | null;
  cache: null | {
    readTokens: number;
    creationTokens: number;
    missTurns: number;
    ttlMin: number;
    wastedTokens: number;
  };
  turnDurationsMs: number[];
  abortedTurns: number;
}

/** One UI contract; provider capability gaps remain explicit `null` values. */
export function diagnosticViewModel(
  analysis: ProviderConversationAnalysis,
): ConversationDiagnosticViewModel {
  const codex = isCodexConversationAnalysis(analysis);
  return {
    provider: codex ? 'codex' : 'claude',
    overview: codex ? analysis.summary : analysis.diagnostic,
    durationMs: analysis.durationMs,
    messageCount: analysis.messageCount,
    maxContextTokens: analysis.maxContextTokens,
    contextWindow: analysis.contextWindow,
    totalTokens: analysis.totalTokens,
    compactionCount: analysis.compactions.length,
    frictionCount: analysis.frictionPoints.length,
    toolErrorCount: analysis.toolErrorCount,
    tools: Object.entries(analysis.toolStats)
      .map(([name, stats]) => ({ name, count: stats.count, errorCount: stats.errorCount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    hotFiles: codex ? [] : analysis.hotFiles.slice(0, 6),
    recommendations: codex
      ? analysis.scoreFactors.map((factor) => ({ kind: 'factor' as const, ...factor }))
      : analysis.tips.map((tip) => ({ kind: 'tip' as const, tip })),
    drift: codex ? null : analysis.drift ?? null,
    cache: codex ? null : {
      readTokens: analysis.cacheReadTokens,
      creationTokens: analysis.cacheCreationTokens,
      missTurns: analysis.cacheMissTurns,
      ttlMin: analysis.cacheTtlMin,
      wastedTokens: analysis.wastedCacheTokens,
    },
    turnDurationsMs: codex ? analysis.turnDurationsMs : [],
    abortedTurns: codex ? analysis.abortedTurns : 0,
  };
}
