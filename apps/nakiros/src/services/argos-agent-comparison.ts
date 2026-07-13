import type {
  ArgosAgentComparison,
  ArgosComparisonMetric,
  ArgosProviderComparison,
  CodexConversationAnalysis,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

function isCodex(
  analysis: ProviderConversationAnalysis,
): analysis is CodexConversationAnalysis {
  return 'provider' in analysis && analysis.provider === 'codex';
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

function metric(
  id: ArgosComparisonMetric['id'],
  value: number | null,
  observedSamples: number,
  sampleSize: number,
): ArgosComparisonMetric {
  return {
    id,
    value: value === null ? null : round(value),
    observedSamples,
    coverage: sampleSize > 0 ? round(observedSamples / sampleSize) : 0,
  };
}

function providerColumn(
  provider: ArgosProviderComparison['provider'],
  analyses: ProviderConversationAnalysis[],
): ArgosProviderComparison {
  const sampleSize = analyses.length;
  const dates = analyses
    .flatMap((analysis) => [analysis.startedAt, analysis.lastMessageAt])
    .map((date) => Date.parse(date))
    .filter(Number.isFinite);
  const tokenValues = analyses
    .map((analysis) => analysis.totalTokens)
    .filter((value): value is number => typeof value === 'number');
  const modelCounts = new Map<string, number>();
  for (const analysis of analyses) {
    if (!isCodex(analysis) || !analysis.model) continue;
    modelCounts.set(analysis.model, (modelCounts.get(analysis.model) ?? 0) + 1);
  }

  const messages = analyses.reduce((total, analysis) => total + analysis.messageCount, 0);
  const frictions = analyses.reduce(
    (total, analysis) => total + analysis.frictionPoints.length,
    0,
  );
  const toolCalls = analyses.reduce(
    (total, analysis) => total + Object.values(analysis.toolStats)
      .reduce((sum, stats) => sum + stats.count, 0),
    0,
  );
  const toolErrors = analyses.reduce(
    (total, analysis) => total + analysis.toolErrorCount,
    0,
  );
  const compactions = analyses.reduce(
    (total, analysis) => total + analysis.compactions.length,
    0,
  );

  return {
    provider,
    sampleSize,
    startedAt: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
    endedAt: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
    models: [...modelCounts.entries()]
      .map(([model, conversations]) => ({ model, conversations }))
      .sort((a, b) => b.conversations - a.conversations || a.model.localeCompare(b.model)),
    metrics: [
      metric('health-score', average(analyses.map((analysis) => analysis.score)), sampleSize, sampleSize),
      metric('tokens-per-conversation', average(tokenValues), tokenValues.length, sampleSize),
      metric(
        'duration-per-conversation',
        average(analyses.map((analysis) => analysis.durationMs)),
        sampleSize,
        sampleSize,
      ),
      metric(
        'friction-per-100-messages',
        messages > 0 ? (frictions / messages) * 100 : null,
        sampleSize,
        sampleSize,
      ),
      metric(
        'tool-errors-per-100-calls',
        toolCalls > 0 ? (toolErrors / toolCalls) * 100 : null,
        sampleSize,
        sampleSize,
      ),
      metric(
        'compactions-per-conversation',
        sampleSize > 0 ? compactions / sampleSize : null,
        sampleSize,
        sampleSize,
      ),
    ],
  };
}

function periodsOverlap(columns: ArgosProviderComparison[]): boolean {
  if (columns.length < 2) return false;
  const starts = columns.map((column) => Date.parse(column.startedAt ?? ''));
  const ends = columns.map((column) => Date.parse(column.endedAt ?? ''));
  if (starts.some((value) => !Number.isFinite(value)) || ends.some((value) => !Number.isFinite(value))) {
    return false;
  }
  return Math.max(...starts) <= Math.min(...ends);
}

/**
 * Build an evidence-first comparison for conversations in one project.
 * This remains observational until Argos can pair sessions by an explicit
 * task identity; consequently it never computes winners or rankings.
 */
export function buildArgosAgentComparison(
  projectId: string,
  analyses: ProviderConversationAnalysis[],
  generatedAt = new Date().toISOString(),
): ArgosAgentComparison {
  const userAnalyses = analyses.filter(
    (analysis) => isCodex(analysis) || analysis.kind !== 'synthetic',
  );
  const columns = (['claude', 'codex'] as const)
    .map((provider) => providerColumn(
      provider,
      userAnalyses.filter((analysis) => (isCodex(analysis) ? 'codex' : 'claude') === provider),
    ))
    .filter((column) => column.sampleSize > 0);
  const overlappingPeriod = periodsOverlap(columns);
  const minSample = columns.length > 0
    ? Math.min(...columns.map((column) => column.sampleSize))
    : 0;
  const reasons: ArgosAgentComparison['reasons'] = [];
  if (columns.length < 2) reasons.push('single-provider');
  if (minSample < 3) reasons.push('small-sample');
  if (columns.length > 1 && !overlappingPeriod) reasons.push('periods-do-not-overlap');
  if (columns.length > 1) reasons.push('tasks-not-paired');

  return {
    projectId,
    generatedAt,
    providers: columns,
    evidence: { sameProject: true, overlappingPeriod, tasksPaired: false },
    confidence: columns.length > 1 && minSample >= 3 && overlappingPeriod
      ? 'directional'
      : 'insufficient',
    reasons,
  };
}
