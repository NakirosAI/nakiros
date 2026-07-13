import { AlertTriangle, CheckCircle2, Compass, Info, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ConversationDrift,
  ConversationTip,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

import { formatLongDuration } from '../../utils/format';
import { isCodexConversationAnalysis } from '../../hooks/useConversationAnalyses';
import { ConvSparkline } from './ConvSparkline';
import { diagnosticViewModel, type DiagnosticRecommendation } from './diagnostic-view-model';
import { Sismograph } from './Sismograph';
import { ConversationDeepAnalysisSection } from './ConversationDeepAnalysisSection';

interface Props { projectId: string; analysis: ProviderConversationAnalysis }

/** Shared diagnostic hierarchy for every provider understood by Argos. */
export function DiagnosticTab({ projectId, analysis }: Props) {
  const { t } = useTranslation('conversations');
  const view = diagnosticViewModel(analysis);
  const codex = isCodexConversationAnalysis(analysis);
  const contextPct = view.contextWindow && view.maxContextTokens != null
    ? Math.round((view.maxContextTokens / view.contextWindow) * 100)
    : null;
  const contextTone: KpiTone = contextPct != null && contextPct >= 75
    ? 'critical'
    : contextPct != null && contextPct >= 50 ? 'watch' : 'neutral';

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <Panel>
        <SectionLabel>{t('drawer.overview')}</SectionLabel>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-n-muted">{view.overview}</p>
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 font-n-mono text-[11px] text-n-subtle">
          <span>{t(`providerFilter.${view.provider}`)}</span>
          <span>·</span><span>{t('badge.compactions', { count: view.compactionCount })}</span>
          <span>·</span><span>{t('badge.friction', { count: view.frictionCount })}</span>
          <span>·</span><span>{t('badge.toolErrors', { count: view.toolErrorCount })}</span>
        </div>
      </Panel>

      <ConversationDeepAnalysisSection projectId={projectId} analysis={analysis} />

      <section>
        <SectionLabel>{t('drawer.tips')}</SectionLabel>
        {view.recommendations.length === 0 ? (
          <div className="mt-2 flex items-center gap-2 border-y border-n-border-subtle py-3 text-[12.5px] text-n-muted">
            <CheckCircle2 size={14} className="text-n-healthy" /> {t('native.noPenalty')}
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-n-border-subtle border-y border-n-border-subtle">
            {view.recommendations.map((recommendation, index) => (
              <RecommendationRow key={`${recommendation.kind}:${index}`} recommendation={recommendation} />
            ))}
          </ul>
        )}
      </section>

      {view.drift && <DriftSection drift={view.drift} />}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>{t('drawer.timeline')}</SectionLabel>
          <span className="font-n-mono text-[10.5px] text-n-subtle">
            {formatLongDuration(view.durationMs)} · {t('messageCount', { count: view.messageCount })}
          </span>
        </div>
        <Panel padded={false} className="mt-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-n-border-subtle px-3.5 py-2.5">
            <Marker label={t('badge.compactions', { count: view.compactionCount })} tone="bg-n-info" />
            <Marker label={t('badge.friction', { count: view.frictionCount })} tone="bg-n-critical" />
            <Marker label={t('badge.toolErrors', { count: view.toolErrorCount })} tone="bg-n-watch" />
          </div>
          <div className="px-3 pb-3 pt-2">
            {codex
              ? <div className="flex h-40 items-end"><ConvSparkline analysis={analysis} width={920} height={148} /></div>
              : <Sismograph analysis={analysis} />}
          </div>
        </Panel>
        <div className="mt-2 flex items-start gap-2 rounded-n-md bg-n-sunken px-3.5 py-2.5 text-[11.5px] leading-relaxed text-n-muted">
          <Info size={13} className="mt-0.5 flex-none text-n-info" />
          <span>{codex ? t('native.contextReadingGuide') : t('drawer.readingGuideBody', { window: formatTokens(view.contextWindow) })}</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={t('drawer.fields.messages')} value={String(view.messageCount)} />
        <Kpi label={t('drawer.fields.duration')} value={formatLongDuration(view.durationMs)} />
        <Kpi label={t('drawer.fields.maxContext')} value={formatTokens(view.maxContextTokens)} unit={view.contextWindow == null ? undefined : `/${formatTokens(view.contextWindow)}${contextPct == null ? '' : ` (${contextPct}%)`}`} tone={contextTone} />
        <Kpi label={t('drawer.fields.tokensTotal')} value={formatTokens(view.totalTokens)} />
      </section>

      {view.cache ? (
        <section>
          <SectionLabel>{t('drawer.cache')}</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label={t('drawer.fields.cacheRead')} value={formatTokens(view.cache.readTokens)} tone="healthy" />
            <Kpi label={t('drawer.fields.cacheCreation')} value={formatTokens(view.cache.creationTokens)} />
            <Kpi label={t('drawer.fields.cacheMisses', { ttlMin: view.cache.ttlMin })} value={String(view.cache.missTurns)} tone={view.cache.missTurns >= 5 ? 'watch' : 'neutral'} />
            <Kpi label={t('drawer.fields.wasted')} value={formatTokens(view.cache.wastedTokens)} tone={view.cache.wastedTokens > 5000 ? 'critical' : 'neutral'} />
          </div>
        </section>
      ) : (
        <section>
          <SectionLabel>{t('native.turnsTitle')}</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Kpi label={t('native.abortsLabel', { defaultValue: 'Interrupted turns' })} value={String(view.abortedTurns)} tone={view.abortedTurns > 0 ? 'watch' : 'neutral'} />
            <Kpi label={t('native.turnAverageLabel', { defaultValue: 'Average turn' })} value={averageDuration(view.turnDurationsMs)} />
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <DataList title={t('drawer.tools')} empty={view.tools.length === 0}>
          {view.tools.map((tool) => (
            <li key={tool.name} className="flex items-center justify-between border-t border-n-border-subtle/60 px-4 py-2 font-n-mono text-[12px]">
              <span className="truncate text-n-fg">{tool.name}</span>
              <span className={tool.errorCount > 0 ? 'text-n-watch' : 'text-n-muted'}>×{tool.count}{tool.errorCount > 0 ? ` · ${tool.errorCount} err` : ''}</span>
            </li>
          ))}
        </DataList>
        <DataList title={t('drawer.hotFiles')} empty={view.hotFiles.length === 0} unavailable={codex}>
          {view.hotFiles.map((file) => (
            <li key={file.path} className="flex items-center justify-between gap-3 border-t border-n-border-subtle/60 px-4 py-2 font-n-mono text-[12px]">
              <span className="truncate text-n-fg">{file.path}</span><span className="text-n-muted">×{file.editCount}</span>
            </li>
          ))}
        </DataList>
      </section>
    </div>
  );
}

function RecommendationRow({ recommendation }: { recommendation: DiagnosticRecommendation }) {
  const { t } = useTranslation('conversations');
  if (recommendation.kind === 'tip') return <TipRow tip={recommendation.tip} />;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-n-xs bg-n-watch-soft text-n-watch"><AlertTriangle size={13} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-3"><span className="text-[13px] font-medium text-n-fg">{t(`native.factors.${recommendation.signal}`)}</span><span className="font-n-mono text-[11px] text-n-critical">−{recommendation.penalty}</span></div>
        <p className="mt-0.5 text-[12px] text-n-muted">{t(`native.factorAdvice.${recommendation.signal}`, { count: recommendation.count })}</p>
      </div>
    </li>
  );
}

function TipRow({ tip }: { tip: ConversationTip }) {
  const { t } = useTranslation('conversations');
  const Icon = tip.category === 'cache' ? Zap : AlertTriangle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-n-xs bg-n-watch-soft text-n-watch"><Icon size={13} /></span>
      <div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-n-fg">{t(`tips.${tip.id}.title`, { defaultValue: tip.id, ...tip.data })}</div><div className="mt-0.5 text-[12px] text-n-muted">{t(`tips.${tip.id}.body`, { defaultValue: '', ...tip.data })}</div></div>
    </li>
  );
}

function DriftSection({ drift }: { drift: ConversationDrift }) {
  const { t } = useTranslation('conversations');
  const tone = drift.severity === 'high' ? 'text-n-critical bg-n-critical-soft' : drift.severity === 'medium' ? 'text-n-watch bg-n-watch-soft' : 'text-n-info bg-n-info-soft';
  return <section><SectionLabel>{t('drawer.drift.sectionLabel')}</SectionLabel><div className="mt-2 flex items-start gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-3"><span className={`flex h-6 w-6 flex-none items-center justify-center rounded-n-xs ${tone}`}><Compass size={13} /></span><div><div className="font-n-mono text-[11px] text-n-fg">{t(`drawer.drift.${drift.type}`)}</div><p className="mt-1 text-[12.5px] text-n-fg">{drift.message}</p><p className="mt-1 text-[12px] text-n-muted">{drift.suggestion}</p></div></div></section>;
}

function Panel({ children, padded = true, className = '' }: { children: React.ReactNode; padded?: boolean; className?: string }) { return <div className={`rounded-n-md border border-n-border-subtle bg-n-surface ${padded ? 'px-4 py-3 ' : ''}${className}`}>{children}</div>; }
function SectionLabel({ children }: { children: React.ReactNode }) { return <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-faint">{children}</div>; }
function Marker({ label, tone }: { label: string; tone: string }) { return <span className="inline-flex items-center gap-1.5 font-n-mono text-[11px] text-n-muted"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} />{label}</span>; }

type KpiTone = 'neutral' | 'critical' | 'watch' | 'healthy';
function Kpi({ label, value, unit, tone = 'neutral' }: { label: string; value: string; unit?: string; tone?: KpiTone }) { const colors = { neutral: 'text-n-fg', critical: 'text-n-critical', watch: 'text-n-watch', healthy: 'text-n-healthy' }; return <div className="rounded-n-md border border-n-border-subtle bg-n-sunken px-3 py-2.5"><div className="font-n-mono text-[9.5px] uppercase tracking-[0.6px] text-n-faint">{label}</div><div className={`mt-1 font-n-mono text-[15px] tabular-nums ${colors[tone]}`}>{value}{unit && <span className="ml-0.5 text-[10.5px] text-n-muted">{unit}</span>}</div></div>; }

function DataList({ title, empty, unavailable = false, children }: { title: string; empty: boolean; unavailable?: boolean; children: React.ReactNode }) { const { t } = useTranslation('conversations'); return <Panel padded={false}><div className="px-4 pb-1.5 pt-3"><SectionLabel>{title}</SectionLabel></div>{empty ? <div className="px-4 pb-3 font-n-mono text-[11px] text-n-faint">{unavailable ? t('native.unavailable', { defaultValue: 'Not exposed by this provider' }) : '—'}</div> : <ul>{children}</ul>}</Panel>; }
function formatTokens(value: number | null): string { if (value == null) return '—'; if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`; if (value >= 1_000) return `${Math.round(value / 1_000)}k`; return String(value); }
function averageDuration(values: number[]): string { if (values.length === 0) return '—'; return formatLongDuration(values.reduce((sum, value) => sum + value, 0) / values.length); }
