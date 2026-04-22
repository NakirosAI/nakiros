import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationAnalysis, Project } from '@nakiros/shared';
import { ConversationHealthBadges } from '../components/conversations/ConversationHealthBadges';
import { ConversationDiagnosticPanel } from '../components/conversations/ConversationDiagnosticPanel';

interface Props {
  project: Project;
}

type SortKey = 'score' | 'recent' | 'longest';
type FilterKey = 'all' | 'critical' | 'compactions' | 'friction' | 'cacheWaste' | 'toolErrors';

export default function ConversationsView({ project }: Props) {
  const { t } = useTranslation('conversations');
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationAnalysis | null>(null);
  const [sort, setSort] = useState<SortKey>('score');
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    setLoading(true);
    window.nakiros.listProjectConversationsWithAnalysis(project.id).then((data) => {
      setAnalyses(data);
      setLoading(false);
    });
  }, [project.id]);

  const visible = useMemo(() => {
    const filtered = analyses.filter((a) => {
      switch (filter) {
        case 'critical':
          return a.score <= 40;
        case 'compactions':
          return a.compactions.length > 0;
        case 'friction':
          return a.frictionPoints.length > 0;
        case 'cacheWaste':
          return a.cacheMissTurns >= 3;
        case 'toolErrors':
          return a.toolErrorCount > 0;
        default:
          return true;
      }
    });

    const sorted = [...filtered];
    // Lowest health scores first — those are the ones worth investigating.
    if (sort === 'score') sorted.sort((a, b) => a.score - b.score);
    else if (sort === 'recent')
      sorted.sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );
    else sorted.sort((a, b) => b.durationMs - a.durationMs);

    return sorted;
  }, [analyses, sort, filter]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {t('headingAnalysis', { count: analyses.length })}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-[var(--text-muted)]">
            {t('sort.label')}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              <option value="score">{t('sort.score')}</option>
              <option value="recent">{t('sort.recent')}</option>
              <option value="longest">{t('sort.longest')}</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[var(--text-muted)]">
            {t('filter.label')}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
              className="rounded border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              <option value="all">{t('filter.all')}</option>
              <option value="critical">{t('filter.critical')}</option>
              <option value="compactions">{t('filter.compactions')}</option>
              <option value="friction">{t('filter.friction')}</option>
              <option value="cacheWaste">{t('filter.cacheWaste')}</option>
              <option value="toolErrors">{t('filter.toolErrors')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
            {t('empty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((a) => (
              <ConversationRow
                key={a.sessionId}
                analysis={a}
                onClick={() => setSelected(a)}
              />
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <ConversationDiagnosticPanel
          project={project}
          analysis={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — health-oriented, not content-oriented.
// ---------------------------------------------------------------------------

function ConversationRow({
  analysis,
  onClick,
}: {
  analysis: ConversationAnalysis;
  onClick: () => void;
}) {
  // Higher score = healthier, so red is the LOW end, green is the HIGH end.
  const scoreTone =
    analysis.score <= 40
      ? 'bg-[var(--danger)] text-white'
      : analysis.score <= 70
        ? 'bg-[var(--warning)] text-black'
        : 'bg-[var(--success)] text-white';

  // Dim healthy conversations so the eye skips them.
  const dimmed = analysis.score >= 80;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          'flex w-full items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--primary)] ' +
          (dimmed ? 'opacity-60' : '')
        }
      >
        <span
          className={
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ' +
            scoreTone
          }
          aria-label={`score ${analysis.score}`}
        >
          {analysis.score}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]">
            {analysis.summary}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {analysis.diagnostic}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
            <span>{new Date(analysis.lastMessageAt).toLocaleDateString()}</span>
            <span>{formatDuration(analysis.durationMs)}</span>
            <span>{analysis.messageCount} msgs</span>
            {analysis.gitBranch && <span>{analysis.gitBranch}</span>}
          </div>
          <div className="mt-2">
            <ConversationHealthBadges analysis={analysis} />
          </div>
        </div>
      </button>
    </li>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}
