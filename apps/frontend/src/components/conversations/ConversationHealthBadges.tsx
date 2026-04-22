import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis } from '@nakiros/shared';
import { Badge } from '../ui/Badge';

interface Props {
  analysis: ConversationAnalysis;
}

/**
 * Small row of "why this conversation is flagged" badges. Only renders
 * signals that are actually present — a clean conversation shows nothing.
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
    </div>
  );
}
