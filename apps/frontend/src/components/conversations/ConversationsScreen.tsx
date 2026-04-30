import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis, Project } from '@nakiros/shared';
import { useConversationAnalyses } from '../../hooks/useConversationAnalyses';
import { EmptyState, LoadingState } from '../ui';
import { ConvRow } from './ConvRow';
import { ConvDrawer } from './ConvDrawer';

interface Props {
  /** Project whose JSONL conversation analyses are shown. */
  project: Project;
}

type FilterKey =
  | 'all'
  | 'critical'
  | 'compactions'
  | 'friction'
  | 'cacheWaste'
  | 'toolErrors';

interface FilterDef {
  id: FilterKey;
  match(a: ConversationAnalysis): boolean;
}

const FILTERS: FilterDef[] = [
  { id: 'all', match: () => true },
  { id: 'critical', match: (a) => a.healthZone === 'degraded' || a.score <= 40 },
  { id: 'compactions', match: (a) => a.compactions.length > 0 },
  { id: 'friction', match: (a) => a.frictionPoints.length > 0 },
  { id: 'cacheWaste', match: (a) => a.cacheMissTurns >= 3 },
  { id: 'toolErrors', match: (a) => a.toolErrorCount > 0 },
];

/**
 * Phase 5 PR10a port of the Conversations screen. Replaces the legacy
 * `ConversationsView` for the new shell only — the old shell still routes
 * to the previous screen until Phase 7 cleanup.
 *
 * Reads the per-project analyses through {@link useConversationAnalyses}
 * (channel `project:listConversationsWithAnalysis`) and renders them as
 * health-first rows. Clicking a row opens the {@link ConvDrawer}, whose
 * Diagnostic tab is the only one shipped in this PR.
 */
export default function ConversationsScreen({ project }: Props) {
  const { t } = useTranslation('conversations');
  const fetched = useConversationAnalyses(project.id);
  const analyses = fetched ?? [];
  const loading = fetched === null;

  const [filter, setFilter] = useState<FilterKey>('all');
  const [open, setOpen] = useState<ConversationAnalysis | null>(null);

  const counts = useMemo(() => {
    const out: Record<FilterKey, number> = {
      all: 0,
      critical: 0,
      compactions: 0,
      friction: 0,
      cacheWaste: 0,
      toolErrors: 0,
    };
    for (const f of FILTERS) {
      out[f.id] = analyses.filter(f.match).length;
    }
    return out;
  }, [analyses]);

  const visible = useMemo(() => {
    const matcher = FILTERS.find((f) => f.id === filter)!.match;
    // Sort by health (critical first); ties broken by recency.
    return analyses
      .filter(matcher)
      .slice()
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
  }, [analyses, filter]);

  if (loading) {
    return <LoadingState>{t('loading')}</LoadingState>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas">
      <header className="flex items-start justify-between gap-6 border-b border-n-border-subtle px-7 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-n-fg">
            {t('headingAnalysis', { count: analyses.length })}
          </h2>
          <p className="mt-1 font-n-mono text-[11px] text-n-subtle">
            {t('subheadingByHealth')}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-n-border-subtle bg-n-sunken px-7 py-2.5">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                'inline-flex items-center gap-1.5 rounded-n-xs border px-2.5 py-1 text-[11.5px] transition-colors ' +
                (active
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                  : 'border-n-border-subtle bg-n-raised text-n-muted hover:text-n-fg')
              }
            >
              <span>{t(`filter.${f.id}`)}</span>
              <span
                className={
                  'font-n-mono text-[10.5px] tabular-nums ' +
                  (active ? 'text-n-accent-strong' : 'text-n-faint')
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState title={analyses.length === 0 ? t('empty') : t('emptyForFilter')} />
        ) : (
          <ul className="flex flex-col">
            {visible.map((a) => (
              <li key={a.sessionId}>
                <ConvRow analysis={a} onOpen={() => setOpen(a)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && <ConvDrawer analysis={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
