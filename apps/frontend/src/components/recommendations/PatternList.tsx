import { useTranslation } from 'react-i18next';
import type { RecommendationPattern } from '@nakiros/shared';

interface Props {
  patterns: RecommendationPattern[];
  selectedId: string | null;
  onSelect(patternId: string): void;
}

/**
 * Left-column list of recommendation patterns. Each row shows the severity
 * badge, zone count, top-token preview, and a hint about the analyser run
 * status. Designed for the two-column Recommendations screen.
 *
 * Severity mapping: `'high'` → n-critical (red tone), `'medium'` → n-watch
 * (amber tone), consistent with ConvRow health-zone colour semantics.
 */
export function PatternList({ patterns, selectedId, onSelect }: Props) {
  const { t } = useTranslation('recommendations');

  if (patterns.length === 0) {
    return (
      <div className="p-6 text-sm text-n-subtle">
        {t('emptyState')}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {patterns.map((p) => {
        const active = p.id === selectedId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={[
                'w-full text-left px-4 py-3 border-b border-n-border-subtle transition-colors',
                active ? 'bg-n-surface' : 'hover:bg-n-raised',
              ].join(' ')}
            >
              {/* Row header: severity badge + zone count */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <SeverityBadge severity={p.severity} />
                <span className="font-n-mono text-[10.5px] text-n-subtle">
                  {p.zoneCount} zones
                </span>
              </div>

              {/* Top-token preview — break-words per feedback_no_truncate_user_content */}
              <div className="text-[13px] leading-snug text-n-fg break-words">
                {p.signature.topTokens.slice(0, 4).join(' · ')}
              </div>

              {/* Analyser run status hint */}
              {p.analysis.status !== 'idle' && (
                <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
                  {p.analysis.status === 'running' && (
                    <span className="text-n-accent">{t('running')}</span>
                  )}
                  {p.analysis.status === 'failed' && (
                    <span className="text-n-critical">{t('failed')}</span>
                  )}
                  {p.analysis.status === 'done' && (
                    <span>recos: {p.analysis.recoCount ?? 0}</span>
                  )}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: RecommendationPattern['severity'] }) {
  const classes =
    severity === 'high'
      ? 'bg-n-critical-soft text-n-critical'
      : 'bg-n-watch-soft text-n-watch';

  return (
    <span
      className={[
        'inline-flex items-center rounded-n-xs px-1.5 py-0.5',
        'font-n-mono text-[10px] uppercase tracking-wider',
        classes,
      ].join(' ')}
    >
      {severity}
    </span>
  );
}
