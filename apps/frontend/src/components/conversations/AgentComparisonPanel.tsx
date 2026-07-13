import type { ArgosAgentComparison, ArgosComparisonMetric } from '@nakiros/shared';
import { useTranslation } from 'react-i18next';

interface Props {
  comparison: ArgosAgentComparison;
}

function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  return minutes >= 1 ? `${minutes.toFixed(minutes >= 10 ? 0 : 1)} min` : `${Math.round(ms / 1_000)} s`;
}

function formatMetric(
  metric: ArgosComparisonMetric,
  locale: string,
): string {
  if (metric.value === null) return '—';
  switch (metric.id) {
    case 'health-score':
      return metric.value.toFixed(0);
    case 'tokens-per-conversation':
      return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
        .format(metric.value);
    case 'duration-per-conversation':
      return formatDuration(metric.value);
    case 'friction-per-100-messages':
    case 'tool-errors-per-100-calls':
      return metric.value.toFixed(1);
    case 'compactions-per-conversation':
      return metric.value.toFixed(2);
  }
}

/** Compact evidence table, shown only when Argos observed multiple providers. */
export function AgentComparisonPanel({ comparison }: Props) {
  const { t, i18n } = useTranslation('conversations');
  if (comparison.providers.length < 2) return null;
  const metricIds = comparison.providers[0]?.metrics.map((metric) => metric.id) ?? [];

  return (
    <section className="border-b border-n-border-subtle bg-n-surface" aria-labelledby="agent-comparison-title">
      <div className="flex flex-wrap items-start justify-between gap-3 px-7 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id="agent-comparison-title" className="font-n-mono text-[11px] font-medium uppercase tracking-[0.08em] text-n-fg">
              {t('comparison.title')}
            </h3>
            <span className="rounded-n-xs border border-n-border-default bg-n-sunken px-1.5 py-0.5 font-n-mono text-[9.5px] uppercase tracking-wide text-n-muted">
              {t(`comparison.confidence.${comparison.confidence}`)}
            </span>
          </div>
          <p className="mt-1 max-w-[70ch] text-[11.5px] text-n-subtle">
            {t('comparison.scope')}
          </p>
        </div>
        <div className="flex items-center gap-3 font-n-mono text-[10.5px] text-n-faint">
          <span>{t('comparison.sameProject')}</span>
          <span>{comparison.evidence.overlappingPeriod ? t('comparison.periodOverlap') : t('comparison.periodSeparate')}</span>
          <span>{t('comparison.tasksUnpaired')}</span>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-n-border-subtle">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="bg-n-sunken font-n-mono text-[10px] uppercase tracking-[0.07em] text-n-faint">
              <th className="w-[34%] px-7 py-2 font-medium">{t('comparison.metric')}</th>
              {comparison.providers.map((provider) => (
                <th key={provider.provider} className="px-4 py-2 font-medium">
                  <span className="text-n-fg">{t(`providerFilter.${provider.provider}`)}</span>
                  <span className="ml-2 normal-case tracking-normal text-n-faint">
                    {t('comparison.sample', { count: provider.sampleSize })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricIds.map((metricId) => (
              <tr key={metricId} className="border-t border-n-border-subtle text-[11.5px]">
                <th className="px-7 py-2 font-normal text-n-muted">{t(`comparison.metrics.${metricId}`)}</th>
                {comparison.providers.map((provider) => {
                  const metric = provider.metrics.find((candidate) => candidate.id === metricId);
                  return (
                    <td key={provider.provider} className="px-4 py-2 font-n-mono tabular-nums text-n-fg">
                      {metric ? formatMetric(metric, i18n.language) : '—'}
                      {metric && metric.coverage < 1 && (
                        <span className="ml-2 text-[9.5px] text-n-watch">
                          {t('comparison.coverage', { value: Math.round(metric.coverage * 100) })}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
