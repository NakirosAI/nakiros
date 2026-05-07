import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis } from '@nakiros/shared';
import { ChevronRight } from 'lucide-react';
import { ConvSparkline } from './ConvSparkline';
import { formatLongDuration } from '../../utils/format';

interface Props {
  analysis: ConversationAnalysis;
  onOpen(): void;
}

/**
 * One conversation in the {@link ConversationsScreen} list. Health-first row:
 * the eye starts on the score chip (red/amber/green tone), reads the title,
 * scans signal badges (compactions, friction, errors, cache waste), and ends
 * on the real `contextSamples` sparkline so trajectory pops at a glance.
 */
export function ConvRow({ analysis, onOpen }: Props) {
  const { t } = useTranslation('conversations');
  const tone = toneClassesFor(analysis.healthZone);

  const compactions = analysis.compactions.length;
  const frictions = analysis.frictionPoints.length;
  const toolErrors = analysis.toolErrorCount;
  const cacheMisses = analysis.cacheMissTurns;
  const contextK = Math.round(analysis.maxContextTokens / 1000);
  const tokensTotalK = Math.round(analysis.totalTokens / 1000);

  const dimmed = analysis.score >= 80;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        'group flex w-full items-start gap-4 border-b border-n-border-subtle px-7 py-3 text-left transition-colors hover:bg-n-raised ' +
        (dimmed ? 'opacity-70' : '')
      }
    >
      <div className="flex w-14 flex-shrink-0 flex-col items-center gap-1">
        <div
          className={
            'flex h-9 w-9 items-center justify-center rounded-n-md border font-n-mono text-[14px] font-medium ' +
            tone.chip
          }
          aria-label={`score ${analysis.score}`}
        >
          {analysis.score}
        </div>
        <span className="font-n-mono text-[9.5px] uppercase tracking-[0.6px] text-n-subtle">
          {analysis.sessionId.slice(0, 6)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13.5px] leading-snug text-n-fg">
          {analysis.summary}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {compactions > 0 && (
            <Chip tone="info">
              {t('badge.compactions', { count: compactions })}
            </Chip>
          )}
          <Chip tone="neutral">{contextK}k ctx</Chip>
          {frictions > 0 && (
            <Chip tone="critical">
              {t('badge.friction', { count: frictions })}
            </Chip>
          )}
          {toolErrors > 0 && (
            <Chip tone="watch">
              {t('badge.toolErrors', { count: toolErrors })}
            </Chip>
          )}
          {cacheMisses >= 3 && (
            <Chip tone="violet">
              {t('badge.cacheMisses', { count: cacheMisses })}
            </Chip>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-n-mono text-[10.5px] text-n-subtle">
          <span>{new Date(analysis.lastMessageAt).toLocaleDateString()}</span>
          <span>·</span>
          <span>{t('messageCount', { count: analysis.messageCount })}</span>
          <span>·</span>
          <span>{formatLongDuration(analysis.durationMs)}</span>
          <span>·</span>
          <span>{tokensTotalK}k total</span>
          {analysis.gitBranch && (
            <>
              <span>·</span>
              <span>{analysis.gitBranch}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <ConvSparkline analysis={analysis} />
        <span className={'font-n-mono text-[10px] uppercase tracking-[0.6px] ' + tone.label}>
          {t(`health.${analysis.healthZone}`)}
        </span>
      </div>

      <ChevronRight
        size={16}
        className="mt-3 flex-shrink-0 text-n-subtle transition-colors group-hover:text-n-muted"
      />
    </button>
  );
}

function toneClassesFor(zone: ConversationAnalysis['healthZone']): {
  chip: string;
  label: string;
} {
  if (zone === 'degraded') {
    return {
      chip: 'border-n-critical/30 bg-n-critical-soft text-n-critical',
      label: 'text-n-critical',
    };
  }
  if (zone === 'watch') {
    return {
      chip: 'border-n-watch/30 bg-n-watch-soft text-n-watch',
      label: 'text-n-watch',
    };
  }
  return {
    chip: 'border-n-healthy/30 bg-n-healthy-soft text-n-healthy',
    label: 'text-n-healthy',
  };
}

function Chip({
  tone,
  children,
}: {
  tone: 'info' | 'neutral' | 'critical' | 'watch' | 'violet';
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    info: 'bg-n-info-soft text-n-info',
    neutral: 'bg-n-raised text-n-muted',
    critical: 'bg-n-critical-soft text-n-critical',
    watch: 'bg-n-watch-soft text-n-watch',
    violet: 'bg-n-violet-soft text-n-violet',
  };
  return (
    <span
      className={
        'inline-flex items-center rounded-n-xs px-1.5 py-0.5 font-n-mono text-[10.5px] ' +
        styles[tone]
      }
    >
      {children}
    </span>
  );
}
