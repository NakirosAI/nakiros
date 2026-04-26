import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import type { Skill, SkillEvalIteration } from '@nakiros/shared';
import Sparkline from '../viz/Sparkline';

interface SkillIterationsTabProps {
  /** Skill we render the iteration history for. */
  skill: Skill;
}

/**
 * Iterations tab — chronological history of every eval iteration
 * recorded for the skill. Port of the `IterationsTab` block from the
 * new-design mockup
 * (`apps/Nakiros-new-design/screens-skills.jsx:553-578`).
 *
 * Each row shows: a mono `iter N` badge (accent for the latest), the
 * timestamp formatted as a relative age, the run's pass rate, a tiny
 * sparkline of the trailing-window pass rates, and a delta badge vs
 * the previous iteration (`deltaVsPreviousIteration`).
 *
 * Reads everything from `Skill.evals.iterations` — no IPC. The mockup
 * showed a static "fix description" line per iteration; the daemon
 * doesn't expose that today, so we surface the iteration's own
 * computed metadata (pass rate, tokens, duration) instead.
 */
export default function SkillIterationsTab({ skill }: SkillIterationsTabProps) {
  const { t } = useTranslation('skills');
  const iterations = skill.evals?.iterations ?? [];

  // Newest-first is the natural reading order for a "history" view.
  const ordered = useMemo(
    () => [...iterations].sort((a, b) => b.number - a.number),
    [iterations],
  );
  const latestNumber = ordered[0]?.number ?? null;

  // For each row, the sparkline shows the running pass-rate trend up
  // to (and including) that iteration — gives a sense of momentum.
  const trendByNumber = useMemo(() => {
    const map = new Map<number, number[]>();
    const sortedAsc = [...iterations].sort((a, b) => a.number - b.number);
    const trail: number[] = [];
    for (const it of sortedAsc) {
      trail.push(Math.round(it.withSkill.passRate * 100));
      map.set(it.number, [...trail]);
    }
    return map;
  }, [iterations]);

  if (iterations.length === 0) {
    return (
      <div className="px-7 py-10">
        <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center">
          <Layers size={20} strokeWidth={1.75} className="mx-auto mb-3 text-n-faint" />
          <div className="text-[13px] text-n-fg">
            {t('iterationsTab.empty', { defaultValue: 'No iteration recorded yet.' })}
          </div>
          <div className="mt-1 text-[12px] text-n-muted">
            {t('iterationsTab.emptyHint', {
              defaultValue: 'Run a first batch of evals to populate the history.',
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-7 py-5 font-n-sans">
      <div className="mb-2.5 flex items-center justify-between font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
        <span>{t('iterationsTab.heading', { defaultValue: 'Iterations · history' })}</span>
        <span className="text-n-faint">
          {t('iterationsTab.count', {
            count: iterations.length,
            defaultValue: '{{count}} iterations',
          })}
        </span>
      </div>
      <div className="space-y-1.5">
        {ordered.map((it) => (
          <IterationRow
            key={it.number}
            iteration={it}
            isLatest={it.number === latestNumber}
            trend={trendByNumber.get(it.number) ?? []}
          />
        ))}
      </div>
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function IterationRow({
  iteration,
  isLatest,
  trend,
}: {
  iteration: SkillEvalIteration;
  isLatest: boolean;
  trend: number[];
}) {
  const passPct = Math.round(iteration.withSkill.passRate * 100);
  const delta = iteration.deltaVsPreviousIteration;
  const deltaPct = delta === null ? null : Math.round(delta * 100);
  const deltaTone = deltaPct === null ? null : tonalDelta(deltaPct);

  const sparkColor = scoreColor(passPct);
  const sparkFill = scoreSoft(passPct);

  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-3">
      <div className="flex items-center gap-3.5">
        <span
          className={
            'inline-flex items-center rounded-n-xs border px-2 py-0.5 font-n-mono text-[11px] tabular-nums ' +
            (isLatest
              ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
              : 'border-n-border-subtle bg-n-sunken text-n-muted')
          }
        >
          iter {iteration.number}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[12.5px] font-medium text-n-fg" style={{ color: sparkColor }}>
              {passPct}%
            </span>
            <span className="font-n-mono text-[10.5px] text-n-faint">
              {iteration.withSkill.passedAssertions}/{iteration.withSkill.totalAssertions} pass
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-n-mono text-[10.5px] text-n-subtle">
            <span>{formatTime(iteration.timestamp)}</span>
            {iteration.withSkill.tokens > 0 && (
              <>
                <span className="text-n-faint">·</span>
                <span>{formatTokens(iteration.withSkill.tokens)}</span>
              </>
            )}
            {iteration.withSkill.durationMs > 0 && (
              <>
                <span className="text-n-faint">·</span>
                <span>{formatDuration(iteration.withSkill.durationMs)}</span>
              </>
            )}
          </div>
        </div>

        {trend.length > 1 && (
          <Sparkline
            data={trend}
            width={80}
            height={20}
            stroke={sparkColor}
            fill={sparkFill}
          />
        )}

        {deltaPct !== null && deltaTone && (
          <span
            className="inline-flex items-center rounded-n-xs border px-1.5 py-0.5 font-n-mono text-[10.5px] tabular-nums"
            style={{
              borderColor: `${deltaTone}33`,
              color: deltaTone,
              background: `${deltaTone}14`,
            }}
          >
            {deltaPct > 0 ? '+' : ''}
            {deltaPct}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 80) return 'var(--n-healthy)';
  if (pct >= 60) return 'var(--n-accent)';
  return 'var(--n-watch)';
}

function scoreSoft(pct: number): string {
  if (pct >= 80) return 'var(--n-healthy-soft)';
  if (pct >= 60) return 'var(--n-accent-soft)';
  return 'var(--n-watch-soft)';
}

function tonalDelta(deltaPct: number): string {
  if (deltaPct > 0) return 'var(--n-healthy)';
  if (deltaPct < 0) return 'var(--n-critical)';
  return 'var(--n-fg-faint)';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const sameDay =
    ts.getFullYear() === now.getFullYear() &&
    ts.getMonth() === now.getMonth() &&
    ts.getDate() === now.getDate();
  if (sameDay) {
    return ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    ts.getFullYear() === yesterday.getFullYear() &&
    ts.getMonth() === yesterday.getMonth() &&
    ts.getDate() === yesterday.getDate();
  if (isYesterday) return 'yesterday';
  const days = Math.floor(diffMs / dayMs);
  if (days < 7) return `${days}d ago`;
  return ts.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} tok`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k tok`;
  return `${(tokens / 1_000_000).toFixed(1)}M tok`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ${seconds % 60}s`;
}
