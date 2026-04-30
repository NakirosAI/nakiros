import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis, ConversationTip } from '@nakiros/shared';
import { AlertTriangle, Zap, Info } from 'lucide-react';
import { Sismograph } from './Sismograph';
import { formatLongDuration } from '../../utils/format';

interface Props {
  analysis: ConversationAnalysis;
}

/**
 * Diagnostic tab body of the conversation drawer. Mirrors the layout of the
 * mockup `ConvDrawer.diagnostic` (`apps/Nakiros-new-design/screens-conversations.jsx`):
 * narrative card, recommendations, sismograph (1-track in PR10a — uplift to
 * 5-tracks lands in PR10c), reading guide, KPI grid, cache efficiency, and a
 * 1fr/1fr split for top tools and hot files. Reads `ConversationAnalysis`
 * straight from IPC — no derived/mocked data.
 */
export function DiagnosticTab({ analysis }: Props) {
  const { t } = useTranslation('conversations');

  const totalK = formatTokensK(analysis.totalTokens);
  const peakK = formatTokensK(analysis.maxContextTokens);
  const winLabel =
    analysis.contextWindow >= 1_000_000
      ? '1M'
      : `${Math.round(analysis.contextWindow / 1000)}k`;
  const ctxPct = Math.round((analysis.maxContextTokens / analysis.contextWindow) * 100);

  const cacheReadK = formatTokensK(analysis.cacheReadTokens);
  const cacheCreationK = formatTokensK(analysis.cacheCreationTokens);
  const wastedK = formatTokensK(analysis.wastedCacheTokens);

  const compactions = analysis.compactions.length;
  const frictions = analysis.frictionPoints.length;
  const toolErrors = analysis.toolErrorCount;
  const cacheMisses = analysis.cacheMissTurns;
  const topHotFile = analysis.hotFiles[0];

  const sortedTools = Object.entries(analysis.toolStats)
    .map(([name, s]) => ({ name, count: s.count, errorCount: s.errorCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const cacheTone: KpiTone = analysis.wastedCacheTokens > 5000 ? 'critical' : 'neutral';
  const ctxTone: KpiTone = analysis.healthZone === 'degraded' ? 'critical' : analysis.healthZone === 'watch' ? 'watch' : 'neutral';

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* === Analyse — narrative card === */}
      <Card>
        <SectionLabel>{t('drawer.overview')}</SectionLabel>
        <p className="mt-2 text-[13px] leading-relaxed text-n-muted">
          {analysis.diagnostic}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-n-muted">
          {compactions > 0 && (
            <>
              <span className="text-n-info">{t('badge.compactions', { count: compactions })}</span>
              {' · '}
            </>
          )}
          <span className="font-n-mono text-n-fg">{peakK}</span>{' '}
          <span>{t('drawer.fields.maxContext')}</span>
          {' '}
          <span className="font-n-mono text-n-faint">/{winLabel} ({ctxPct}%)</span>
          {frictions > 0 && (
            <>
              {' · '}
              <span className="text-n-critical">{t('badge.friction', { count: frictions })}</span>
            </>
          )}
          {toolErrors > 0 && (
            <>
              {' · '}
              <span className="text-n-watch">{t('badge.toolErrors', { count: toolErrors })}</span>
            </>
          )}
          {cacheMisses >= 3 && (
            <>
              {' · '}
              <span className="text-n-violet">
                ~<span className="font-n-mono">{wastedK}</span> {t('drawer.fields.wasted').toLowerCase()}
              </span>
            </>
          )}
          {topHotFile && (
            <>
              {' · '}
              <span>hot:</span>{' '}
              <span className="font-n-mono text-n-accent">{topHotFile.path}</span>
            </>
          )}
        </p>
      </Card>

      {/* === Tips — what to do next time === */}
      <section>
        <SectionLabel>{t('drawer.tips')}</SectionLabel>
        {analysis.tips.length > 0 ? (
          <ul className="mt-2 grid gap-1.5">
            {analysis.tips.map((tip, idx) => (
              <RecRow key={idx} tip={tip} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 font-n-mono text-[11.5px] text-n-faint">{t('drawer.tipsEmpty')}</p>
        )}
      </section>

      {/* === Sismograph — context curve with compactions + frictions === */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>{t('drawer.timeline')}</SectionLabel>
          <span className="font-n-mono text-[10.5px] text-n-subtle">
            {formatLongDuration(analysis.durationMs)} · {analysis.messageCount} msgs
          </span>
        </div>
        <Card padded={false} className="mt-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-n-border-subtle px-3.5 py-2.5">
            <span className="font-n-mono text-[10px] uppercase tracking-[0.6px] text-n-faint">
              {t('drawer.markers')}
            </span>
            <MarkerLegend dot="bg-n-info" label={t('badge.compactions', { count: compactions })} />
            <MarkerLegend dot="bg-n-critical" label={t('badge.friction', { count: frictions })} />
            <MarkerLegend dot="bg-n-watch" label={t('badge.toolErrors', { count: toolErrors })} />
          </div>
          <div className="px-3 pb-3 pt-2">
            <Sismograph analysis={analysis} />
          </div>
        </Card>
        <div className="mt-2 rounded-n-md bg-n-sunken px-3.5 py-2.5">
          <div className="font-n-mono text-[10px] uppercase tracking-[0.6px] text-n-faint">
            {t('drawer.readingGuide')}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-n-muted">
            {t('drawer.readingGuideBody', { window: winLabel })}
          </p>
        </div>
      </section>

      {/* === KPI grid — fundamentals === */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={t('drawer.fields.messages')} value={String(analysis.messageCount)} />
        <Kpi label={t('drawer.fields.duration')} value={formatLongDuration(analysis.durationMs)} />
        <Kpi
          label={t('drawer.fields.maxContext')}
          value={peakK}
          unit={`/${winLabel}`}
          tone={ctxTone}
        />
        <Kpi label={t('drawer.fields.tokensTotal')} value={totalK} />
      </section>

      {/* === Cache efficiency — surprise often === */}
      <section>
        <SectionLabel>{t('drawer.cache')}</SectionLabel>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label={t('drawer.fields.cacheRead')} value={cacheReadK} tone="healthy" />
          <Kpi label={t('drawer.fields.cacheCreation')} value={cacheCreationK} />
          <Kpi
            label={t('drawer.fields.cacheMisses', { ttlMin: analysis.cacheTtlMin })}
            value={String(cacheMisses)}
            tone={cacheMisses >= 5 ? 'watch' : 'neutral'}
          />
          <Kpi label={t('drawer.fields.wasted')} value={wastedK} tone={cacheTone} />
        </div>
      </section>

      {/* === Top tools + Hot files — side by side === */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Card padded={false}>
          <div className="px-4 pt-3 pb-1.5">
            <SectionLabel>{t('drawer.tools')}</SectionLabel>
          </div>
          {sortedTools.length === 0 ? (
            <div className="px-4 pb-3 font-n-mono text-[11px] text-n-faint">—</div>
          ) : (
            <ul>
              {sortedTools.map((tool) => {
                const errPct = tool.count > 0 ? Math.round((tool.errorCount / tool.count) * 100) : 0;
                return (
                  <li
                    key={tool.name}
                    className="flex items-center justify-between border-t border-n-border-subtle/60 px-4 py-2 font-n-mono text-[12px]"
                  >
                    <span className="text-n-fg">{tool.name}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-n-muted">×{tool.count}</span>
                      {tool.errorCount > 0 && (
                        <span className={errPct >= 30 ? 'text-n-critical' : 'text-n-watch'}>
                          {tool.errorCount} err
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-3 pb-1.5">
            <SectionLabel>{t('drawer.hotFiles')}</SectionLabel>
          </div>
          {analysis.hotFiles.length === 0 ? (
            <div className="px-4 pb-3 font-n-mono text-[11px] text-n-faint">—</div>
          ) : (
            <ul>
              {analysis.hotFiles.slice(0, 6).map((hot) => (
                <li
                  key={hot.path}
                  className="flex items-center justify-between gap-3 border-t border-n-border-subtle/60 px-4 py-2 font-n-mono text-[12px]"
                >
                  <span className="truncate text-n-fg">{hot.path}</span>
                  <span className="flex-shrink-0 tabular-nums text-n-muted">×{hot.editCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Card({
  children,
  padded = true,
  className = '',
}: {
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        'rounded-n-md border border-n-border-subtle bg-n-surface ' +
        (padded ? 'px-4 py-3 ' : '') +
        className
      }
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-faint">
      {children}
    </div>
  );
}

type KpiTone = 'neutral' | 'critical' | 'watch' | 'healthy';

function Kpi({
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: KpiTone;
}) {
  const valueClass: Record<KpiTone, string> = {
    neutral: 'text-n-fg',
    critical: 'text-n-critical',
    watch: 'text-n-watch',
    healthy: 'text-n-healthy',
  };
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-sunken px-3 py-2.5">
      <div className="font-n-mono text-[9.5px] uppercase tracking-[0.6px] text-n-faint">
        {label}
      </div>
      <div className={'mt-1 font-n-mono text-[15px] tabular-nums ' + valueClass[tone]}>
        {value}
        {unit && <span className="ml-0.5 text-[10.5px] text-n-muted">{unit}</span>}
      </div>
    </div>
  );
}

function MarkerLegend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-n-mono text-[11px] text-n-muted">
      <span className={'h-1.5 w-1.5 rounded-full ' + dot} />
      {label}
    </span>
  );
}

function RecRow({ tip }: { tip: ConversationTip }) {
  const { t } = useTranslation('conversations');

  const tone = toneForSeverity(tip.severity);
  const Icon = iconForCategory(tip.category);
  const economyTokens =
    typeof tip.data['economyTokens'] === 'number' ? (tip.data['economyTokens'] as number) : 0;

  return (
    <li className="flex items-start gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5">
      <span
        className={
          'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs ' + tone.iconBg
        }
        aria-hidden="true"
      >
        <Icon size={13} className={tone.iconFg} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[13px] font-medium text-n-fg">
            {t(`tips.${tip.id}.title`, { defaultValue: tip.id, ...tip.data })}
          </div>
          {economyTokens > 0 && (
            <span
              className={
                'flex-shrink-0 font-n-mono text-[11px] tabular-nums ' +
                (tip.severity === 'critical'
                  ? 'text-n-critical'
                  : tip.severity === 'warning'
                    ? 'text-n-watch'
                    : 'text-n-muted')
              }
            >
              {formatEconomy(economyTokens)}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-n-muted">
          {t(`tips.${tip.id}.body`, { defaultValue: '', ...tip.data })}
        </div>
      </div>
    </li>
  );
}

function formatEconomy(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M billed`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k billed`;
  return `${tokens} billed`;
}

function toneForSeverity(severity: ConversationTip['severity']): {
  iconBg: string;
  iconFg: string;
} {
  if (severity === 'critical') {
    return { iconBg: 'bg-n-critical-soft', iconFg: 'text-n-critical' };
  }
  if (severity === 'warning') {
    return { iconBg: 'bg-n-watch-soft', iconFg: 'text-n-watch' };
  }
  return { iconBg: 'bg-n-info-soft', iconFg: 'text-n-info' };
}

function iconForCategory(category: ConversationTip['category']) {
  if (category === 'workflow' || category === 'skills') return Zap;
  if (category === 'context' || category === 'cache') return Info;
  return AlertTriangle;
}

function formatTokensK(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}
