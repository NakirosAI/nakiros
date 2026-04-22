import type { ConversationAnalysis } from '@nakiros/shared';

/**
 * Derived metrics across a population of conversations. All computed
 * client-side from an already-analyzed list — no extra IPC needed.
 */
export interface AggregatedStats {
  totalCount: number;
  averageScore: number;
  compactionRate: number;
  degradedRate: number;
  frictionRate: number;
  lateFrictionRate: number;
  toolErrorRate: number;
  cacheWasteTotalTokens: number;
  cacheWasteAvgPerConv: number;
  healthyCount: number;
  watchCount: number;
  degradedCount: number;
}

export interface AggregatedSignal {
  /** Identifier matching an i18n key (`insights.<id>.title` / `.body`). */
  id: string;
  severity: 'info' | 'warning' | 'critical';
  /** Values for i18n interpolation. */
  data: Record<string, string | number>;
}

export interface ToolErrorFrequency {
  name: string;
  totalUses: number;
  totalErrors: number;
  errorRate: number;
  /** How many conversations in the window involved this tool. */
  affectedConvs: number;
}

export interface HotFileFrequency {
  path: string;
  /** In how many distinct conversations this file was flagged as hot. */
  convCount: number;
  totalEdits: number;
}

export interface TipFrequency {
  id: string;
  convCount: number;
  severity: 'info' | 'warning' | 'critical';
}

export function aggregate(convs: ConversationAnalysis[]): AggregatedStats {
  const total = Math.max(convs.length, 1);
  const sumScore = convs.reduce((acc, c) => acc + c.score, 0);
  const withCompaction = convs.filter((c) => c.compactions.length > 0).length;
  const degraded = convs.filter((c) => c.healthZone === 'degraded').length;
  const withFriction = convs.filter((c) => c.frictionPoints.length > 0).length;
  const withLateFriction = convs.filter(
    (c) => c.frictionPoints.filter((f) => f.offsetPct > 0.5).length >= 2,
  ).length;
  const withToolErrors = convs.filter((c) => c.toolErrorCount > 0).length;
  const cacheWasteTotal = convs.reduce((acc, c) => acc + c.wastedCacheTokens, 0);

  return {
    totalCount: convs.length,
    averageScore: Math.round(sumScore / total),
    compactionRate: withCompaction / total,
    degradedRate: degraded / total,
    frictionRate: withFriction / total,
    lateFrictionRate: withLateFriction / total,
    toolErrorRate: withToolErrors / total,
    cacheWasteTotalTokens: cacheWasteTotal,
    cacheWasteAvgPerConv: Math.round(cacheWasteTotal / total),
    healthyCount: convs.filter((c) => c.healthZone === 'healthy').length,
    watchCount: convs.filter((c) => c.healthZone === 'watch').length,
    degradedCount: degraded,
  };
}

/**
 * Turns the stats into prioritised insight ids the UI renders as cards.
 * Rules deliberately tight — surface patterns, not trivia.
 */
export function buildInsights(
  stats: AggregatedStats,
  convs: ConversationAnalysis[],
): AggregatedSignal[] {
  const signals: AggregatedSignal[] = [];

  if (stats.totalCount < 3) {
    return signals; // too few samples to draw conclusions
  }

  const pct = (n: number) => Math.round(n * 100);

  if (stats.compactionRate >= 0.3) {
    signals.push({
      id: 'high-compaction-rate',
      severity: stats.compactionRate >= 0.5 ? 'critical' : 'warning',
      data: {
        pct: pct(stats.compactionRate),
        count: convs.filter((c) => c.compactions.length > 0).length,
      },
    });
  }

  if (stats.degradedRate >= 0.3) {
    signals.push({
      id: 'frequent-degraded-zone',
      severity: stats.degradedRate >= 0.5 ? 'critical' : 'warning',
      data: { pct: pct(stats.degradedRate) },
    });
  }

  if (stats.lateFrictionRate >= 0.25) {
    signals.push({
      id: 'late-session-drift',
      severity: 'warning',
      data: { pct: pct(stats.lateFrictionRate) },
    });
  }

  if (stats.cacheWasteAvgPerConv >= 200_000) {
    signals.push({
      id: 'cache-waste-pattern',
      severity: stats.cacheWasteAvgPerConv >= 1_000_000 ? 'warning' : 'info',
      data: {
        avgK: Math.round(stats.cacheWasteAvgPerConv / 1000),
        totalM: (stats.cacheWasteTotalTokens / 1_000_000).toFixed(1),
      },
    });
  }

  if (stats.averageScore <= 40 && stats.totalCount >= 5) {
    signals.push({
      id: 'systemic-low-health',
      severity: 'critical',
      data: { score: stats.averageScore },
    });
  }

  const weight = { critical: 0, warning: 1, info: 2 } as const;
  return signals.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

export function topFailingTools(convs: ConversationAnalysis[], limit = 5): ToolErrorFrequency[] {
  const acc = new Map<string, { uses: number; errors: number; convs: Set<string> }>();
  for (const c of convs) {
    for (const [name, stats] of Object.entries(c.toolStats)) {
      const entry = acc.get(name) ?? { uses: 0, errors: 0, convs: new Set() };
      entry.uses += stats.count;
      entry.errors += stats.errorCount;
      if (stats.errorCount > 0) entry.convs.add(c.sessionId);
      acc.set(name, entry);
    }
  }
  return Array.from(acc.entries())
    .filter(([, e]) => e.errors > 0 && e.uses >= 5)
    .map(([name, e]) => ({
      name,
      totalUses: e.uses,
      totalErrors: e.errors,
      errorRate: e.errors / e.uses,
      affectedConvs: e.convs.size,
    }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, limit);
}

export function recurringHotFiles(convs: ConversationAnalysis[], limit = 5): HotFileFrequency[] {
  const acc = new Map<string, { count: number; edits: number }>();
  for (const c of convs) {
    for (const hf of c.hotFiles) {
      const e = acc.get(hf.path) ?? { count: 0, edits: 0 };
      e.count += 1;
      e.edits += hf.editCount;
      acc.set(hf.path, e);
    }
  }
  return Array.from(acc.entries())
    .filter(([, e]) => e.count >= 2) // must recur across sessions
    .map(([path, e]) => ({ path, convCount: e.count, totalEdits: e.edits }))
    .sort((a, b) => b.convCount - a.convCount)
    .slice(0, limit);
}

export function topTipFrequencies(convs: ConversationAnalysis[], limit = 5): TipFrequency[] {
  const acc = new Map<string, { count: number; severity: TipFrequency['severity'] }>();
  for (const c of convs) {
    for (const t of c.tips) {
      const e = acc.get(t.id) ?? { count: 0, severity: t.severity };
      e.count += 1;
      // Keep worst-seen severity for this tip id.
      if (severityRank(t.severity) < severityRank(e.severity)) e.severity = t.severity;
      acc.set(t.id, e);
    }
  }
  return Array.from(acc.entries())
    .map(([id, e]) => ({ id, convCount: e.count, severity: e.severity }))
    .sort((a, b) => b.convCount - a.convCount)
    .slice(0, limit);
}

function severityRank(s: TipFrequency['severity']): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}
