import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Lightbulb } from 'lucide-react';
import type { ConversationAnalysis, Project } from '@nakiros/shared';
import { ConversationDiagnosticPanel } from '../components/conversations/ConversationDiagnosticPanel';
import {
  aggregate,
  buildInsights,
  recurringHotFiles,
  topFailingTools,
  topTipFrequencies,
} from '../components/conversations/ConversationsAggregation';

interface Props {
  project: Project;
}

type WindowKey = '10' | '30' | '90' | 'all';

export default function RecommendationsView({ project }: Props) {
  const { t } = useTranslation('recommendations');
  const [analyses, setAnalyses] = useState<ConversationAnalysis[] | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>('30');
  const [selected, setSelected] = useState<ConversationAnalysis | null>(null);

  useEffect(() => {
    setAnalyses(null);
    window.nakiros.listProjectConversationsWithAnalysis(project.id).then(setAnalyses);
  }, [project.id]);

  const windowed = useMemo(() => {
    if (!analyses) return [];
    const sorted = [...analyses].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
    if (windowKey === 'all') return sorted;
    const n = parseInt(windowKey, 10);
    return sorted.slice(0, n);
  }, [analyses, windowKey]);

  const stats = useMemo(() => aggregate(windowed), [windowed]);
  const insights = useMemo(() => buildInsights(stats, windowed), [stats, windowed]);
  const failingTools = useMemo(() => topFailingTools(windowed), [windowed]);
  const hotFiles = useMemo(() => recurringHotFiles(windowed), [windowed]);
  const topTips = useMemo(() => topTipFrequencies(windowed), [windowed]);
  const criticalConvs = useMemo(
    () => [...windowed].sort((a, b) => a.score - b.score).slice(0, 5),
    [windowed],
  );

  if (!analyses) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        {t('loading')}
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-full bg-[var(--bg-muted)] p-4">
          <Lightbulb size={32} className="text-[var(--text-muted)]" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <p className="max-w-md text-center text-sm text-[var(--text-muted)]">
          {t('empty', { project: project.name })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          {t('window.label')}
          <select
            value={windowKey}
            onChange={(e) => setWindowKey(e.target.value as WindowKey)}
            className="rounded border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="10">{t('window.10')}</option>
            <option value="30">{t('window.30')}</option>
            <option value="90">{t('window.90')}</option>
            <option value="all">{t('window.all')}</option>
          </select>
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Headline stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label={t('stats.count')} value={stats.totalCount.toString()} />
          <Card
            label={t('stats.avgScore')}
            value={stats.averageScore.toString()}
            tone={
              stats.averageScore <= 40
                ? 'danger'
                : stats.averageScore <= 70
                  ? 'warning'
                  : 'success'
            }
          />
          <Card
            label={t('stats.compactionRate')}
            value={`${Math.round(stats.compactionRate * 100)}%`}
            tone={stats.compactionRate >= 0.5 ? 'danger' : stats.compactionRate >= 0.3 ? 'warning' : 'muted'}
          />
          <Card
            label={t('stats.cacheWaste')}
            value={`${(stats.cacheWasteTotalTokens / 1_000_000).toFixed(1)}M`}
          />
        </div>

        {/* Health zone distribution */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t('sections.distribution')}
          </h3>
          <HealthBar
            healthy={stats.healthyCount}
            watch={stats.watchCount}
            degraded={stats.degradedCount}
            labels={{
              healthy: t('zones.healthy'),
              watch: t('zones.watch'),
              degraded: t('zones.degraded'),
            }}
          />
        </section>

        {/* Pattern insights */}
        {insights.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('sections.insights')}
            </h3>
            <ul className="flex flex-col gap-2">
              {insights.map((s) => (
                <InsightCard key={s.id} id={s.id} severity={s.severity} data={s.data} />
              ))}
            </ul>
          </section>
        )}

        {/* Grid: top tips / tools / hot files */}
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <RankedList
            title={t('sections.topTips')}
            empty={t('empty.tips')}
            items={topTips.map((tip) => ({
              key: tip.id,
              primary: t(`conversations:tips.${tip.id}.title`, { defaultValue: tip.id } as Record<string, unknown>),
              secondary: t('badge.convCount', { count: tip.convCount }),
              severity: tip.severity,
            }))}
          />
          <RankedList
            title={t('sections.topTools')}
            empty={t('empty.tools')}
            items={failingTools.map((tool) => ({
              key: tool.name,
              primary: tool.name,
              secondary: t('toolStat', {
                errors: tool.totalErrors,
                rate: Math.round(tool.errorRate * 100),
              }),
              severity: tool.errorRate >= 0.3 ? 'critical' : tool.errorRate >= 0.15 ? 'warning' : 'info',
            }))}
          />
          <RankedList
            title={t('sections.hotFiles')}
            empty={t('empty.files')}
            items={hotFiles.map((f) => ({
              key: f.path,
              primary: shortenPath(f.path),
              secondary: t('fileStat', { convs: f.convCount, edits: f.totalEdits }),
              severity: f.convCount >= 4 ? 'warning' : 'info',
            }))}
          />
        </section>

        {/* Critical conversations drill-down */}
        {criticalConvs.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('sections.critical')}
            </h3>
            <ul className="flex flex-col gap-2">
              {criticalConvs.map((c) => (
                <li key={c.sessionId}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className="flex w-full items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--primary)]"
                  >
                    <ScoreChip score={c.score} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {c.summary}
                      </div>
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        {c.diagnostic}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
// Subcomponents
// ---------------------------------------------------------------------------

function Card({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[var(--danger)]'
      : tone === 'warning'
        ? 'text-[var(--warning)]'
        : tone === 'success'
          ? 'text-[var(--success)]'
          : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className={'text-xl font-bold ' + toneClass}>{value}</div>
    </div>
  );
}

function HealthBar({
  healthy,
  watch,
  degraded,
  labels,
}: {
  healthy: number;
  watch: number;
  degraded: number;
  labels: { healthy: string; watch: string; degraded: string };
}) {
  const total = Math.max(healthy + watch + degraded, 1);
  const h = (healthy / total) * 100;
  const w = (watch / total) * 100;
  const d = (degraded / total) * 100;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded border border-[var(--line)]">
        {h > 0 && (
          <div style={{ width: `${h}%` }} className="flex items-center justify-center bg-[var(--success)] text-[10px] font-semibold text-white">
            {h >= 8 ? `${Math.round(h)}%` : ''}
          </div>
        )}
        {w > 0 && (
          <div style={{ width: `${w}%` }} className="flex items-center justify-center bg-[var(--warning)] text-[10px] font-semibold text-black">
            {w >= 8 ? `${Math.round(w)}%` : ''}
          </div>
        )}
        {d > 0 && (
          <div style={{ width: `${d}%` }} className="flex items-center justify-center bg-[var(--danger)] text-[10px] font-semibold text-white">
            {d >= 8 ? `${Math.round(d)}%` : ''}
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
          {labels.healthy} — {healthy}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--warning)]" />
          {labels.watch} — {watch}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--danger)]" />
          {labels.degraded} — {degraded}
        </span>
      </div>
    </div>
  );
}

function InsightCard({
  id,
  severity,
  data,
}: {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  data: Record<string, string | number>;
}) {
  const { t } = useTranslation('recommendations');
  const { icon, tone } = severityStyle(severity);
  return (
    <li className={'flex items-start gap-3 rounded-lg border px-3 py-2.5 ' + tone}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-sm font-semibold text-[var(--text-primary)]">
          {t(`insights.${id}.title`, data)}
        </div>
        <div className="text-xs leading-relaxed text-[var(--text-muted)]">
          {t(`insights.${id}.body`, data)}
        </div>
      </div>
    </li>
  );
}

function severityStyle(sev: 'info' | 'warning' | 'critical'): {
  icon: React.ReactNode;
  tone: string;
} {
  if (sev === 'critical')
    return {
      icon: <AlertCircle size={16} className="text-[var(--danger)]" />,
      tone: 'border-[var(--danger)] bg-[var(--bg-soft)]',
    };
  if (sev === 'warning')
    return {
      icon: <AlertTriangle size={16} className="text-[var(--warning)]" />,
      tone: 'border-[var(--warning)] bg-[var(--bg-soft)]',
    };
  return {
    icon: <Lightbulb size={16} className="text-[var(--primary)]" />,
    tone: 'border-[var(--line)] bg-[var(--bg-soft)]',
  };
}

function RankedList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    key: string;
    primary: string;
    secondary: string;
    severity: 'info' | 'warning' | 'critical';
  }>;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h4>
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--line)] px-3 py-2 text-xs text-[var(--text-muted)]">
          {empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const dot =
              it.severity === 'critical'
                ? 'bg-[var(--danger)]'
                : it.severity === 'warning'
                  ? 'bg-[var(--warning)]'
                  : 'bg-[var(--primary)]';
            return (
              <li
                key={it.key}
                className="flex items-start justify-between gap-2 rounded border border-[var(--line)] bg-[var(--bg-soft)] px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={'inline-block h-1.5 w-1.5 shrink-0 rounded-full ' + dot} />
                  <span
                    className="truncate text-xs font-medium text-[var(--text-primary)]"
                    title={it.primary}
                  >
                    {it.primary}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                  {it.secondary}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  const tone =
    score <= 40
      ? 'bg-[var(--danger)] text-white'
      : score <= 70
        ? 'bg-[var(--warning)] text-black'
        : 'bg-[var(--success)] text-white';
  return (
    <span
      className={
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ' +
        tone
      }
    >
      {score}
    </span>
  );
}

function shortenPath(path: string, maxSegments = 3): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= maxSegments) return path;
  return '…/' + parts.slice(-maxSegments).join('/');
}
