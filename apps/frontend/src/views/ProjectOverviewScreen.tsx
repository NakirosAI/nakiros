import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronRight,
  FileCode2,
  Layers,
  MessageSquare,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ConversationAnalysis, Project } from '@nakiros/shared';
import { ConversationDiagnosticPanel } from '../components/conversations/ConversationDiagnosticPanel';
import {
  aggregate,
  recurringHotFiles,
  topFailingTools,
  topTipFrequencies,
} from '../components/conversations/ConversationsAggregation';
import { useConversationAnalyses } from '../hooks/useConversationAnalyses';
import Sparkline from '../components/viz/Sparkline';
import HBar from '../components/viz/HBar';
import { bucketizeForOverview } from '../lib/overview-buckets';

interface Props {
  /** Project whose conversation analyses are aggregated. */
  project: Project;
}

type WindowKey = '10' | '30' | '90' | 'all';
const WINDOW_KEYS: WindowKey[] = ['10', '30', '90', 'all'];

/**
 * New-design Project Overview — port of `screens-overview.jsx` from the
 * Nakiros mockup, wired to real data via `useConversationAnalyses`.
 *
 * Renders:
 * - A header with project name + path + window picker (10/30/90/all)
 * - 5 KPI cards with semi-transparent sparklines derived from
 *   {@link bucketizeForOverview}: count, average score, compaction
 *   rate, cache wasted (M tokens), frictions count
 * - A Health distribution bar (healthy / watch / critical)
 * - 3 ranked lists (top tips / fragile tools / hot files) reusing the
 *   same `Conversations Aggregation` helpers as the legacy overview
 * - A "Critical conversations" list opening the existing
 *   {@link ConversationDiagnosticPanel} for drill-down
 *
 * Mounted from {@link NewShell} when the active project tab's `view` is
 * `'overview'`. The legacy {@link ProjectOverview} stays accessible
 * outside of `?shell=new`.
 */
export default function ProjectOverviewScreen({ project }: Props) {
  const { t } = useTranslation('overview');
  const analyses = useConversationAnalyses(project.id);
  const [windowKey, setWindowKey] = useState<WindowKey>('30');
  const [selected, setSelected] = useState<ConversationAnalysis | null>(null);

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
  const series = useMemo(() => bucketizeForOverview(windowed), [windowed]);
  const failingTools = useMemo(() => topFailingTools(windowed), [windowed]);
  const hotFiles = useMemo(() => recurringHotFiles(windowed), [windowed]);
  const topTips = useMemo(() => topTipFrequencies(windowed), [windowed]);
  const criticalConvs = useMemo(
    () =>
      [...windowed]
        .filter((c) => c.healthZone !== 'healthy')
        .sort((a, b) => a.score - b.score)
        .slice(0, 5),
    [windowed],
  );

  const totalFrictions = useMemo(
    () => windowed.reduce((s, c) => s + c.frictionPoints.length, 0),
    [windowed],
  );

  if (!analyses) {
    return (
      <div className="flex flex-1 items-center justify-center text-n-muted">
        {t('loading')}
      </div>
    );
  }

  const hasData = windowed.length > 0;
  const totalConvs = stats.healthyCount + stats.watchCount + stats.degradedCount;
  const cacheWasteM = (stats.cacheWasteTotalTokens / 1_000_000).toFixed(1);
  const scoreTone =
    stats.averageScore >= 80
      ? 'var(--n-healthy)'
      : stats.averageScore >= 65
        ? 'var(--n-accent)'
        : 'var(--n-watch)';
  const scoreSparkColor =
    stats.averageScore >= 80 ? 'var(--n-healthy)' : 'var(--n-accent)';

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-n-border-subtle px-7 pt-5 pb-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2.5">
            <h1 className="m-0 truncate font-n-mono text-[18px] font-medium text-n-fg">
              {project.name}
            </h1>
            <span className="rounded-n-xs border border-n-border-subtle bg-n-sunken px-1.5 py-0.5 font-n-mono text-[10.5px] uppercase tracking-wide text-n-subtle">
              claude
            </span>
          </div>
          <div className="truncate font-n-mono text-[11.5px] text-n-faint" title={project.projectPath}>
            {project.projectPath}
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-n-md border border-n-border-subtle bg-n-sunken p-0.5">
          {WINDOW_KEYS.map((v) => {
            const active = windowKey === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setWindowKey(v)}
                aria-pressed={active}
                className={
                  'rounded-n-xs border-none px-2.5 py-1 font-n-mono text-[11.5px] transition-colors ' +
                  (active ? 'bg-n-raised text-n-fg' : 'bg-transparent text-n-muted hover:text-n-fg')
                }
              >
                {v === 'all' ? t('window.all') : v}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {!hasData ? (
          <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center text-sm text-n-muted">
            {t('noAnalyzedHint')}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
              <KPI
                label={t('stats.count')}
                value={totalConvs.toString()}
                icon={<MessageSquare />}
                series={series.count}
              />
              <KPI
                label={t('stats.avgScore')}
                value={stats.averageScore.toString()}
                icon={<Sparkles />}
                series={series.score}
                valueColor={scoreTone}
                sparklineColor={scoreSparkColor}
                sparklineFill={
                  stats.averageScore >= 80 ? 'var(--n-healthy-soft)' : 'var(--n-accent-soft)'
                }
              />
              <KPI
                label={t('stats.compactionRate')}
                value={`${Math.round(stats.compactionRate * 100)}%`}
                icon={<Layers />}
                series={series.compactionRate}
                sparklineColor="var(--n-info)"
                sparklineFill="var(--n-info-soft)"
              />
              <KPI
                label={t('stats.cacheWaste')}
                value={`${cacheWasteM}M`}
                sub={t('stats.cacheWasteSub')}
                icon={<Zap />}
                series={series.cacheWasted}
                valueColor="var(--n-watch)"
                sparklineColor="var(--n-watch)"
                sparklineFill="var(--n-watch-soft)"
              />
              <KPI
                label={t('stats.frictions')}
                value={totalFrictions.toString()}
                sub={t('stats.windowSub', { window: windowKey === 'all' ? '∞' : windowKey })}
                icon={<AlertTriangle />}
                series={series.frictions}
                valueColor="var(--n-critical)"
                sparklineColor="var(--n-critical)"
                sparklineFill="var(--n-critical-soft)"
              />
            </div>

            {/* Health distribution */}
            <Card className="mb-5">
              <SectionLabel
                right={
                  <span className="font-n-mono text-[11px] text-n-faint">
                    {totalConvs} {t('hb.convs')}
                    {windowKey !== 'all' && <> · {t('hb.lastDays', { n: windowKey })}</>}
                  </span>
                }
              >
                {t('sections.distribution')}
              </SectionLabel>
              <HealthSegmentedBar
                healthy={stats.healthyCount}
                watch={stats.watchCount}
                critical={stats.degradedCount}
                labels={{
                  healthy: t('zones.healthy'),
                  watch: t('zones.watch'),
                  critical: t('zones.degraded'),
                }}
              />
            </Card>

            {/* 3-column lists */}
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <Card padded={false}>
                <div className="px-4 pt-3 pb-2">
                  <SectionLabel>{t('sections.topTips')}</SectionLabel>
                </div>
                {topTips.length === 0 ? (
                  <Empty label={t('empty.tips')} />
                ) : (
                  topTips.map((tip) => (
                    <ListRow
                      key={tip.id}
                      primary={t(`conversations:tips.${tip.id}.title`, {
                        defaultValue: tip.id,
                      } as Record<string, unknown>)}
                      right={
                        <span className="font-n-mono tabular-nums text-[11.5px] text-n-muted">
                          {t('badge.convCount', { count: tip.convCount })}
                        </span>
                      }
                    />
                  ))
                )}
              </Card>

              <Card padded={false}>
                <div className="px-4 pt-3 pb-2">
                  <SectionLabel>{t('sections.topTools')}</SectionLabel>
                </div>
                {failingTools.length === 0 ? (
                  <Empty label={t('empty.tools')} />
                ) : (
                  failingTools.map((tool) => {
                    const ratePct = Math.round(tool.errorRate * 100);
                    const color =
                      ratePct > 30
                        ? 'var(--n-critical)'
                        : ratePct > 10
                          ? 'var(--n-watch)'
                          : 'var(--n-healthy)';
                    return (
                      <ListRow
                        key={tool.name}
                        primary={
                          <span className="font-n-mono">
                            <Wrench size={11} className="mr-1.5 inline-block text-n-faint" strokeWidth={2.25} />
                            {tool.name}
                          </span>
                        }
                        secondary={
                          <span className="font-n-mono text-[10.5px]">
                            {t('toolStatUses', { count: tool.totalUses })}
                          </span>
                        }
                        right={
                          <div className="flex items-center gap-2">
                            <div className="w-14">
                              <HBar value={ratePct} max={100} color={color} height={3} />
                            </div>
                            <span
                              className="font-n-mono tabular-nums text-[11px]"
                              style={{ color: ratePct > 30 ? 'var(--n-critical)' : 'var(--n-fg-muted)' }}
                            >
                              {tool.totalErrors} err · {ratePct}%
                            </span>
                          </div>
                        }
                      />
                    );
                  })
                )}
              </Card>

              <Card padded={false}>
                <div className="px-4 pt-3 pb-2">
                  <SectionLabel>{t('sections.hotFiles')}</SectionLabel>
                </div>
                {hotFiles.length === 0 ? (
                  <Empty label={t('empty.files')} />
                ) : (
                  hotFiles.map((f) => (
                    <ListRow
                      key={f.path}
                      primary={
                        <span className="block truncate font-n-mono text-[12px]" title={f.path}>
                          <FileCode2 size={11} className="mr-1.5 inline-block text-n-faint" strokeWidth={2.25} />
                          {shortenPath(f.path)}
                        </span>
                      }
                      right={
                        <div className="flex items-center gap-2.5">
                          <span className="font-n-mono tabular-nums text-[11px] text-n-muted">
                            {t('fileStatConvs', { count: f.convCount })}
                          </span>
                          <span className="text-n-faint">·</span>
                          <span className="font-n-mono tabular-nums text-[11px] text-n-muted">
                            {t('fileStatEdits', { count: f.totalEdits })}
                          </span>
                        </div>
                      }
                    />
                  ))
                )}
              </Card>
            </div>

            {/* Critical conversations */}
            {criticalConvs.length > 0 && (
              <Card padded={false}>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <SectionLabel className="!mb-0">
                    {t('sections.critical')}
                  </SectionLabel>
                </div>
                {criticalConvs.map((c) => (
                  <CriticalConvRow key={c.sessionId} conv={c} onOpen={() => setSelected(c)} />
                ))}
              </Card>
            )}
          </>
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

// ── Sub-components ─────────────────────────────────────────────────────────

interface KPIProps {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  series: number[];
  valueColor?: string;
  sparklineColor?: string;
  sparklineFill?: string;
}

function KPI({
  label,
  value,
  sub,
  icon,
  series,
  valueColor,
  sparklineColor,
  sparklineFill,
}: KPIProps) {
  return (
    <div className="relative flex min-h-[88px] flex-col gap-1.5 overflow-hidden rounded-n-lg border border-n-border-subtle bg-n-surface px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {label}
        </span>
        {icon && (
          <span className="text-n-faint">
            {/* `as any` to set size on cloned lucide elt without dragging the type. */}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {wrapIcon(icon)}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span
          className="font-n-mono text-[26px] font-medium leading-[1.05] tabular-nums"
          style={{ color: valueColor ?? 'var(--n-fg)' }}
        >
          {value}
        </span>
        {sub && <span className="font-n-mono text-[11px] text-n-subtle">{sub}</span>}
      </div>
      {series.length > 0 && (
        <div className="absolute bottom-3 right-3 opacity-85">
          <Sparkline
            data={series}
            width={70}
            height={22}
            stroke={sparklineColor ?? 'var(--n-accent)'}
            fill={sparklineFill ?? 'var(--n-accent-soft)'}
          />
        </div>
      )}
    </div>
  );
}

function wrapIcon(icon: ReactNode) {
  // Lucide icons expose `size` prop; when callers passed naked <Icon /> we
  // re-clone with a constant size for the KPI header.
  const element = icon as React.ReactElement<{ size?: number }>;
  return <element.type {...element.props} size={13} strokeWidth={2.25} />;
}

function Card({
  children,
  padded = true,
  className,
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        'rounded-n-lg border border-n-border-subtle bg-n-surface ' +
        (padded ? 'p-4 ' : '') +
        (className ?? '')
      }
    >
      {children}
    </div>
  );
}

function SectionLabel({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'mb-2 flex items-center justify-between font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle ' +
        (className ?? '')
      }
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

function ListRow({
  primary,
  secondary,
  right,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-[36px] items-center gap-2.5 border-t border-n-border-subtle px-4 py-2">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-[12.5px] text-n-fg">{primary}</div>
        {secondary && <div className="text-[11px] text-n-subtle">{secondary}</div>}
      </div>
      {right}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="border-t border-n-border-subtle px-4 py-3 font-n-mono text-[11px] text-n-faint">
      {label}
    </div>
  );
}

function HealthSegmentedBar({
  healthy,
  watch,
  critical,
  labels,
}: {
  healthy: number;
  watch: number;
  critical: number;
  labels: { healthy: string; watch: string; critical: string };
}) {
  const total = Math.max(healthy + watch + critical, 1);
  const h = (healthy / total) * 100;
  const w = (watch / total) * 100;
  const c = (critical / total) * 100;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-n-sunken">
        <div className="bg-n-healthy transition-[width] duration-200" style={{ width: `${h}%` }} />
        <div className="bg-n-watch transition-[width] duration-200" style={{ width: `${w}%` }} />
        <div className="bg-n-critical transition-[width] duration-200" style={{ width: `${c}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-3.5 font-n-mono text-[11px] text-n-muted">
        <Legend color="var(--n-healthy)" label={labels.healthy} value={healthy} />
        <Legend color="var(--n-watch)" label={labels.watch} value={watch} />
        <Legend color="var(--n-critical)" label={labels.critical} value={critical} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span>
        {label} — <span className="text-n-fg">{value}</span>
      </span>
    </span>
  );
}

function CriticalConvRow({
  conv,
  onOpen,
}: {
  conv: ConversationAnalysis;
  onOpen(): void;
}) {
  const tone = conv.healthZone === 'degraded' ? 'critical' : 'watch';
  const compactionCount = conv.compactions.length;
  const frictionsCount = conv.frictionPoints.length;
  const cacheWasteK = Math.round(conv.wastedCacheTokens / 1000);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 border-t border-n-border-subtle bg-transparent px-4 py-3 transition-colors hover:bg-n-raised"
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-n-sm font-n-mono text-[12px] font-medium"
        style={{
          background: `var(--n-${tone}-soft)`,
          color: `var(--n-${tone})`,
        }}
      >
        {conv.score}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-n-fg">{conv.summary}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2.5 font-n-mono text-[11px] text-n-subtle">
          <span>{conv.maxContextTokens.toLocaleString()} ctx max</span>
          {compactionCount > 0 && (
            <>
              <span className="text-n-faint">·</span>
              <span className="text-n-info">
                {compactionCount} compaction{compactionCount > 1 ? 's' : ''}
              </span>
            </>
          )}
          {frictionsCount > 0 && (
            <>
              <span className="text-n-faint">·</span>
              <span className="text-n-critical">
                {frictionsCount} friction{frictionsCount > 1 ? 's' : ''}
              </span>
            </>
          )}
          {conv.toolErrorCount > 0 && (
            <>
              <span className="text-n-faint">·</span>
              <span className="text-n-watch">{conv.toolErrorCount} tool errors</span>
            </>
          )}
          {cacheWasteK > 0 && (
            <>
              <span className="text-n-faint">·</span>
              <span>~{cacheWasteK}k cache wasted</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight
        size={14}
        strokeWidth={2.25}
        className="text-n-faint transition-colors group-hover:text-n-accent"
      />
    </div>
  );
}

function shortenPath(path: string, maxSegments = 3): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= maxSegments) return path;
  return '…/' + parts.slice(-maxSegments).join('/');
}
