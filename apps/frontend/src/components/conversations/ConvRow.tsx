import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CodexConversationAnalysis,
  ConversationAnalysis,
  ConversationHealthZone,
  DriftType,
} from '@nakiros/shared';
import { ChevronRight, Compass } from 'lucide-react';
import { ConvSparkline } from './ConvSparkline';
import { formatLongDuration } from '../../utils/format';
import {
  isCodexConversationAnalysis,
  type ProviderConversationAnalysis,
} from '../../hooks/useConversationAnalyses';

interface Props {
  analysis: ProviderConversationAnalysis;
  onOpen(): void;
}

interface RowChip {
  key: string;
  label: string;
  tone: ChipTone;
}

interface ConversationRowViewModel {
  provider: 'claude' | 'codex';
  chips: RowChip[];
  tokens: number | null;
  context: string | null;
  dimmed: boolean;
}

export function ConversationRow({ analysis, onOpen }: Props) {
  const { t } = useTranslation('conversations');
  const tone = toneClassesFor(analysis.healthZone);
  const vm = rowViewModel(analysis, t);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={'group flex w-full items-start gap-4 border-b border-n-border-subtle px-7 py-3 text-left transition-colors hover:bg-n-raised ' + (vm.dimmed ? 'opacity-70' : '')}
    >
      <div className="flex w-14 flex-shrink-0 flex-col items-center gap-1">
        <div className={'flex h-9 w-9 items-center justify-center rounded-n-md border font-n-mono text-[14px] font-medium ' + tone.chip} aria-label={t('native.scoreLabel', { score: analysis.score })}>
          {analysis.score}
        </div>
        <span className="font-n-mono text-[9.5px] uppercase tracking-[0.6px] text-n-subtle">{analysis.sessionId.slice(0, 6)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13.5px] leading-snug text-n-fg">{analysis.summary || t('native.untitled')}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip tone="provider">{t(`providerFilter.${vm.provider}`)}</Chip>
          {vm.context && <Chip tone="neutral">{vm.context}</Chip>}
          {vm.chips.map((chip) => <Chip key={chip.key} tone={chip.tone}>{chip.label}</Chip>)}
          {!isCodexConversationAnalysis(analysis) && analysis.drift != null && (
            <DriftChip type={analysis.drift.type} severity={analysis.drift.severity} message={analysis.drift.message} suggestion={analysis.drift.suggestion} />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-n-mono text-[10.5px] text-n-subtle">
          <span>{new Date(analysis.lastMessageAt).toLocaleDateString()}</span><span>·</span>
          <span>{t('messageCount', { count: analysis.messageCount })}</span><span>·</span>
          <span>{formatLongDuration(analysis.durationMs)}</span>
          {vm.tokens != null && <><span>·</span><span>{t('native.totalTokens', { value: formatCompact(vm.tokens) })}</span></>}
          {analysis.gitBranch && <><span>·</span><span>{analysis.gitBranch}</span></>}
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <ConvSparkline analysis={analysis} />
        <span className={'font-n-mono text-[10px] uppercase tracking-[0.6px] ' + tone.label}>{t(`health.${analysis.healthZone}`)}</span>
      </div>
      <ChevronRight size={16} className="mt-3 flex-shrink-0 text-n-subtle transition-colors group-hover:text-n-muted" />
    </button>
  );
}

function rowViewModel(
  analysis: ProviderConversationAnalysis,
  t: ReturnType<typeof useTranslation>['t'],
): ConversationRowViewModel {
  if (isCodexConversationAnalysis(analysis)) return codexRowViewModel(analysis, t);
  const chips: RowChip[] = [];
  if (analysis.compactions.length > 0) chips.push({ key: 'compactions', label: t('badge.compactions', { count: analysis.compactions.length }), tone: 'info' });
  if (analysis.frictionPoints.length > 0) chips.push({ key: 'friction', label: t('badge.friction', { count: analysis.frictionPoints.length }), tone: 'critical' });
  if (analysis.toolErrorCount > 0) chips.push({ key: 'errors', label: t('badge.toolErrors', { count: analysis.toolErrorCount }), tone: 'watch' });
  if (analysis.cacheMissTurns >= 3) chips.push({ key: 'cache', label: t('badge.cacheMisses', { count: analysis.cacheMissTurns }), tone: 'violet' });
  return {
    provider: 'claude',
    chips,
    tokens: analysis.totalTokens,
    context: `${Math.round(analysis.maxContextTokens / 1000)}k ctx`,
    dimmed: analysis.score >= 80,
  };
}

function codexRowViewModel(
  analysis: CodexConversationAnalysis,
  t: ReturnType<typeof useTranslation>['t'],
): ConversationRowViewModel {
  const chips: RowChip[] = [];
  if (analysis.model) chips.push({ key: 'model', label: analysis.model, tone: 'neutral' });
  if (analysis.compactions.length > 0) chips.push({ key: 'compactions', label: t('badge.compactions', { count: analysis.compactions.length }), tone: 'info' });
  if (analysis.toolErrorCount > 0) chips.push({ key: 'errors', label: t('badge.toolErrors', { count: analysis.toolErrorCount }), tone: 'watch' });
  if (analysis.frictionPoints.length > 0) chips.push({ key: 'friction', label: t('badge.friction', { count: analysis.frictionPoints.length }), tone: 'critical' });
  if (analysis.abortedTurns > 0) chips.push({ key: 'aborts', label: t('native.aborts', { count: analysis.abortedTurns }), tone: 'watch' });
  const context = analysis.contextWindow == null
    ? null
    : t('native.contextPeak', {
        peak: analysis.maxContextTokens == null ? t('native.unknown') : formatCompact(analysis.maxContextTokens),
        window: formatCompact(analysis.contextWindow),
      });
  return { provider: 'codex', chips, tokens: analysis.totalTokens, context, dimmed: analysis.score >= 80 };
}

function formatCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

function toneClassesFor(zone: ConversationHealthZone): { chip: string; label: string } {
  if (zone === 'degraded') return { chip: 'border-n-critical/30 bg-n-critical-soft text-n-critical', label: 'text-n-critical' };
  if (zone === 'watch') return { chip: 'border-n-watch/30 bg-n-watch-soft text-n-watch', label: 'text-n-watch' };
  return { chip: 'border-n-healthy/30 bg-n-healthy-soft text-n-healthy', label: 'text-n-healthy' };
}

type ChipTone = 'provider' | 'info' | 'neutral' | 'critical' | 'watch' | 'violet';
function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const styles: Record<ChipTone, string> = {
    provider: 'border border-n-border-subtle bg-n-raised text-n-fg',
    info: 'bg-n-info-soft text-n-info',
    neutral: 'bg-n-raised text-n-muted',
    critical: 'bg-n-critical-soft text-n-critical',
    watch: 'bg-n-watch-soft text-n-watch',
    violet: 'bg-n-violet-soft text-n-violet',
  };
  return <span className={'inline-flex items-center rounded-n-xs px-1.5 py-0.5 font-n-mono text-[10.5px] ' + styles[tone]}>{children}</span>;
}

function DriftChip({ type, severity, message, suggestion }: { type: DriftType; severity: 'low' | 'medium' | 'high'; message: string; suggestion: string }) {
  const { t } = useTranslation('conversations');
  const [open, setOpen] = useState(false);
  const tone = { low: 'bg-n-info-soft text-n-info', medium: 'bg-n-watch-soft text-n-watch', high: 'bg-n-critical-soft text-n-critical' }[severity];
  const border = { low: 'border-n-info/30', medium: 'border-n-watch/30', high: 'border-n-critical/30' }[severity];
  return (
    <span className="relative inline-flex">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} aria-label={t(`badge.drift.${type}`)} className={'inline-flex cursor-default items-center gap-1 rounded-n-xs px-1.5 py-0.5 font-n-mono text-[10.5px] ' + tone}>
        <Compass size={9} aria-hidden="true" />{t(`badge.drift.${type}`)}
      </button>
      {open && <div className={'pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-64 rounded-n-md border bg-n-canvas px-3 py-2.5 shadow-n-pop ' + border} role="tooltip"><p className="break-words text-[12px] leading-relaxed text-n-fg">{message}</p><p className="mt-1.5 break-words text-[11.5px] leading-relaxed text-n-muted">{suggestion}</p></div>}
    </span>
  );
}
