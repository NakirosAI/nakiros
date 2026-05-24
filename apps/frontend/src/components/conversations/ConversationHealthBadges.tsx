import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis, DriftType } from '@nakiros/shared';
import { Compass } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface Props {
  analysis: ConversationAnalysis;
}

/**
 * Small row of "why this conversation is flagged" badges. Only renders
 * signals that are actually present — a clean conversation shows nothing.
 * Includes a drift badge when `analysis.drift` is non-null and non-undefined.
 */
export function ConversationHealthBadges({ analysis }: Props) {
  const { t } = useTranslation('conversations');
  const compactions = analysis.compactions.length;
  const tokensK = Math.round(analysis.maxContextTokens / 1000);
  const frictions = analysis.frictionPoints.length;
  const toolErrors = analysis.toolErrorCount;
  const cacheMisses = analysis.cacheMissTurns;
  const hotFiles = analysis.hotFiles.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {compactions > 0 && (
        <Badge variant={compactions >= 2 ? 'danger' : 'warning'}>
          {t('badge.compactions', { count: compactions })}
        </Badge>
      )}
      {analysis.healthZone !== 'healthy' && (
        <Badge variant={analysis.healthZone === 'degraded' ? 'danger' : 'warning'}>
          {t('badge.tokens', { k: tokensK })}
        </Badge>
      )}
      {frictions > 0 && (
        <Badge variant={frictions >= 3 ? 'danger' : 'warning'}>
          {t('badge.friction', { count: frictions })}
        </Badge>
      )}
      {toolErrors > 0 && (
        <Badge variant={toolErrors >= 5 ? 'danger' : 'warning'}>
          {t('badge.toolErrors', { count: toolErrors })}
        </Badge>
      )}
      {cacheMisses >= 3 && (
        <Badge variant="warning">
          {t('badge.cacheMisses', { count: cacheMisses })}
        </Badge>
      )}
      {hotFiles > 0 && (
        <Badge variant="info">{t('badge.hotFiles', { count: hotFiles })}</Badge>
      )}
      {analysis.drift != null && (
        <DriftBadge type={analysis.drift.type} severity={analysis.drift.severity} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DriftBadge({ type, severity }: { type: DriftType; severity: 'low' | 'medium' | 'high' }) {
  const { t } = useTranslation('conversations');

  // n-* tokens — Badge uses legacy CSS vars, we inline a chip here instead.
  const tone: Record<typeof severity, string> = {
    low: 'bg-n-info-soft text-n-info border-n-info/30',
    medium: 'bg-n-watch-soft text-n-watch border-n-watch/30',
    high: 'bg-n-critical-soft text-n-critical border-n-critical/30',
  };

  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ' +
        tone[severity]
      }
    >
      <Compass size={10} aria-hidden="true" />
      {t(`badge.drift.${type}`)}
    </span>
  );
}
