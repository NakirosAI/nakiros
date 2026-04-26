import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
import type {
  EvalMatrix,
  EvalMatrixCell,
  EvalMatrixRow,
  GetEvalMatrixRequest,
  IterationRunArtifact,
} from '@nakiros/shared';

interface EvalDiffOverlayProps {
  /** Matrix the diff is computed from. */
  matrix: EvalMatrix;
  /** The "current" iteration — what the user clicked. */
  currentIteration: number;
  /** Identity of the skill — forwarded to `loadIterationRun`. */
  baseRequest: GetEvalMatrixRequest;
  /** Closes the overlay (back button, Escape, X). */
  onClose(): void;
}

interface PerEvalDiff {
  evalName: string;
  prev: EvalMatrixCell | null;
  cur: EvalMatrixCell | null;
  delta: number;
  isRegression: boolean;
}

interface AssertionDiff {
  index: number;
  text: string;
  type: 'script' | 'llm' | 'manual';
  prev: 'pass' | 'fail' | 'missing';
  cur: 'pass' | 'fail' | 'missing';
  isRegression: boolean;
}

/**
 * Full-screen overlay comparing two iterations of the same skill —
 * port of `EvalDiffView` from `apps/Nakiros-new-design/eval-diff.jsx`.
 * Triggered when the user clicks any cell in the matrix: the click
 * is reduced to its iteration number; the previous iteration in
 * `matrix.iterations` becomes the baseline of the comparison.
 *
 * Top section reads from {@link EvalMatrix} alone (no IPC) so it
 * paints instantly:
 * - RunHistorySparkline of `metrics.passRateByIteration` with the
 *   current and previous iterations highlighted
 * - RunSummaryCard for prev / cur with pass totals + tokens + duration
 *   aggregated from the with-skill cells
 * - DeltaBadge of total pass diff
 * - 4 KPIs (pass rate, regressions, tokens, duration) with prev → cur
 *   strikethrough + delta
 *
 * Bottom-left lists every eval with a DiffBar comparing prev vs cur
 * pass rate, plus a delta badge and a regressions-only filter.
 *
 * Bottom-right shows assertion-by-assertion drilldown for the
 * selected eval — fetches `loadIterationRun` for both prev and cur
 * (with-skill config) and aligns assertions by their text. Fixtures
 * and trace diff are intentionally not implemented here: the daemon
 * doesn't surface fixture-level data through `IterationRunArtifact`,
 * and a faithful port would require a structured channel
 * (see PR follow-up note).
 *
 * Closes on Escape, click on the overlay backdrop, or the X button.
 */
export default function EvalDiffOverlay({
  matrix,
  currentIteration,
  baseRequest,
  onClose,
}: EvalDiffOverlayProps) {
  const { t } = useTranslation('skills');

  const indexInMatrix = matrix.iterations.indexOf(currentIteration);
  const previousIteration = indexInMatrix > 0 ? matrix.iterations[indexInMatrix - 1] : null;

  const [selectedEval, setSelectedEval] = useState<string | null>(null);
  const [regressionsOnly, setRegressionsOnly] = useState(false);

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Per-eval diff (no IPC)
  const perEval = useMemo<PerEvalDiff[]>(() => {
    if (indexInMatrix < 0) return [];
    return matrix.rows.map((row) => {
      const cur = row.withSkill[indexInMatrix] ?? null;
      const prev = previousIteration === null ? null : row.withSkill[indexInMatrix - 1] ?? null;
      const curScore = cur ? cur.passed : 0;
      const prevScore = prev ? prev.passed : 0;
      const delta = curScore - prevScore;
      return {
        evalName: row.evalName,
        prev,
        cur,
        delta,
        isRegression: delta < 0 && prev !== null,
      };
    });
  }, [matrix, indexInMatrix, previousIteration]);

  // First eval that regressed becomes the default selection so the
  // drilldown surfaces useful info on open.
  useEffect(() => {
    if (selectedEval) return;
    const firstRegression = perEval.find((p) => p.isRegression);
    if (firstRegression) {
      setSelectedEval(firstRegression.evalName);
      return;
    }
    if (perEval[0]) setSelectedEval(perEval[0].evalName);
  }, [perEval, selectedEval]);

  const aggregates = useMemo(() => aggregateIterations(matrix, indexInMatrix), [matrix, indexInMatrix]);

  const visibleEvals = regressionsOnly ? perEval.filter((p) => p.isRegression) : perEval;
  const regressionCount = perEval.filter((p) => p.isRegression).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-n-canvas font-n-sans">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3.5 border-b border-n-border-subtle px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-n-xs px-2 py-1 text-[12.5px] text-n-muted hover:bg-n-raised hover:text-n-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          {t('diff.back', { defaultValue: 'Back to matrix' })}
        </button>
        <span className="h-3.5 w-px bg-n-border-subtle" />
        <GitCompare size={16} strokeWidth={2} className="text-n-violet" />
        <div>
          <div className="font-n-mono text-[10.5px] uppercase tracking-[0.6px] text-n-faint">
            Eval diff
          </div>
          <div className="text-[14px] font-semibold text-n-fg">
            {previousIteration === null
              ? `Run #${currentIteration}`
              : `Run #${previousIteration} → Run #${currentIteration}`}
          </div>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          disabled
          className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-subtle px-3 font-n-mono text-[11.5px] text-n-muted opacity-60"
        >
          <Download size={11} strokeWidth={2} />
          {t('diff.export', { defaultValue: 'Export diff' })}
        </button>
        <button
          type="button"
          disabled
          className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[11.5px] text-n-accent opacity-60"
        >
          <Check size={11} strokeWidth={2.5} />
          {t('diff.promote', { defaultValue: 'Promote' })} #{currentIteration}
        </button>
      </header>

      {/* Top: history + side-by-side cards + KPIs */}
      <div className="flex-shrink-0 px-6 pb-3 pt-5">
        <RunHistorySparkline
          iterations={matrix.iterations}
          passRates={matrix.metrics.passRateByIteration}
          currentIteration={currentIteration}
          previousIteration={previousIteration}
        />

        <div className="mt-4 grid grid-cols-[1fr_60px_1fr] items-stretch gap-3.5">
          {previousIteration === null ? (
            <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-4 text-center font-n-mono text-[11.5px] text-n-faint">
              {t('diff.noPrevious', {
                defaultValue: 'No previous iteration to compare with.',
              })}
            </div>
          ) : (
            <RunSummaryCard
              label="Previous"
              accent={false}
              iteration={previousIteration}
              agg={aggregates.prev}
            />
          )}
          <DeltaBadge delta={aggregates.passDelta} />
          <RunSummaryCard
            label="Current"
            accent
            iteration={currentIteration}
            agg={aggregates.cur}
          />
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <DiffKPI
            label={t('diff.kpiPassRate', { defaultValue: 'Pass rate' })}
            prev={aggregates.prev ? `${Math.round(aggregates.prev.passRate * 100)}%` : '—'}
            cur={aggregates.cur ? `${Math.round(aggregates.cur.passRate * 100)}%` : '—'}
            delta={aggregates.prev ? signedPct(aggregates.cur, aggregates.prev) : null}
            tone={passRateTone(aggregates.cur?.passRate ?? 0)}
          />
          <DiffKPI
            label={t('diff.kpiRegressions', { defaultValue: 'Regressions' })}
            prev="—"
            cur={regressionCount.toString()}
            delta={regressionCount > 0 ? `+${regressionCount}` : null}
            tone={regressionCount > 0 ? 'var(--n-critical)' : 'var(--n-fg-muted)'}
          />
          <DiffKPI
            label={t('diff.kpiTokens', { defaultValue: 'Tokens' })}
            prev={aggregates.prev ? formatTokens(aggregates.prev.tokens) : '—'}
            cur={aggregates.cur ? formatTokens(aggregates.cur.tokens) : '—'}
            delta={aggregates.prev && aggregates.cur ? signedTokens(aggregates.cur.tokens - aggregates.prev.tokens) : null}
            tone="var(--n-fg-muted)"
          />
          <DiffKPI
            label={t('diff.kpiDuration', { defaultValue: 'Duration' })}
            prev={aggregates.prev ? formatDuration(aggregates.prev.durationMs) : '—'}
            cur={aggregates.cur ? formatDuration(aggregates.cur.durationMs) : '—'}
            delta={
              aggregates.prev && aggregates.cur
                ? signedDuration(aggregates.cur.durationMs - aggregates.prev.durationMs)
                : null
            }
            tone="var(--n-fg-faint)"
          />
        </div>
      </div>

      {/* Body — 2-column split */}
      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr] overflow-hidden">
        {/* Left: per-eval list */}
        <aside className="overflow-y-auto border-r border-n-border-subtle px-4 pb-6 pt-2">
          <SectionLabel
            right={
              <button
                type="button"
                onClick={() => setRegressionsOnly((v) => !v)}
                disabled={regressionCount === 0}
                className={
                  'inline-flex items-center gap-1.5 rounded-n-xs border px-2 py-0.5 font-n-mono text-[10.5px] uppercase tracking-[0.5px] ' +
                  (regressionCount === 0
                    ? 'border-n-border-subtle text-n-faint opacity-40'
                    : regressionsOnly
                      ? 'border-n-critical bg-n-critical-soft text-n-critical'
                      : 'border-n-border-subtle text-n-muted hover:text-n-fg')
                }
              >
                <AlertTriangle size={10} strokeWidth={2.25} />
                {t('diff.regressionsOnly', { defaultValue: 'Regressions only' })} · {regressionCount}
              </button>
            }
          >
            {t('diff.perEval', { defaultValue: 'Per-eval comparison' })}
          </SectionLabel>
          <div className="flex flex-col gap-1.5">
            {visibleEvals.length === 0 && (
              <div className="rounded-n-md border border-dashed border-n-border-subtle px-3.5 py-6 text-center font-n-mono text-[11.5px] text-n-faint">
                {t('diff.noRegression', { defaultValue: 'No regression on this run.' })}
              </div>
            )}
            {visibleEvals.map((p) => (
              <PerEvalRow
                key={p.evalName}
                diff={p}
                selected={selectedEval === p.evalName}
                onClick={() => setSelectedEval(p.evalName)}
              />
            ))}
          </div>
        </aside>

        {/* Right: drilldown */}
        <main className="overflow-y-auto px-6 pb-6 pt-2">
          {selectedEval && (
            <AssertionDrilldown
              evalName={selectedEval}
              baseRequest={baseRequest}
              currentIteration={currentIteration}
              previousIteration={previousIteration}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Run history sparkline ──────────────────────────────────────────────────

function RunHistorySparkline({
  iterations,
  passRates,
  currentIteration,
  previousIteration,
}: {
  iterations: number[];
  passRates: number[];
  currentIteration: number;
  previousIteration: number | null;
}) {
  const W = 600;
  const H = 40;
  const padX = 8;
  const padY = 6;

  if (iterations.length === 0 || passRates.length === 0) return null;

  const xs = iterations.map((_, i) =>
    iterations.length === 1 ? padX : padX + (i / (iterations.length - 1)) * (W - 2 * padX),
  );
  const ys = passRates.map((r) => H - padY - r * (H - 2 * padY));
  const path = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${ys[i]!.toFixed(2)}`)
    .join(' ');
  const areaPath = `${path} L ${xs[xs.length - 1]!.toFixed(2)} ${H} L ${xs[0]!.toFixed(2)} ${H} Z`;
  const min = Math.min(...passRates);
  const max = Math.max(...passRates);
  const last = passRates[passRates.length - 1] ?? 0;

  return (
    <div className="flex items-center gap-4 rounded-n-lg border border-n-border-subtle bg-n-surface px-3.5 py-3">
      <div className="flex-shrink-0">
        <div className="font-n-mono text-[9.5px] uppercase tracking-[0.7px] text-n-faint">
          Last {iterations.length} runs
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-n-mono text-[18px] font-semibold tabular-nums text-n-fg">
            {Math.round(last * 100)}%
          </span>
          <span className="font-n-mono text-[10.5px] text-n-faint">
            min {Math.round(min * 100)}% · max {Math.round(max * 100)}%
          </span>
        </div>
      </div>
      <div className="relative flex-1" style={{ height: H }}>
        <svg width={W} height={H} className="absolute inset-0 block w-full">
          <defs>
            <linearGradient id="diffSparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--n-accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--n-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#diffSparkFill)" />
          <path d={path} fill="none" stroke="var(--n-accent)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {iterations.map((iter, i) => {
          const isCur = iter === currentIteration;
          const isPrev = previousIteration !== null && iter === previousIteration;
          const radius = isCur || isPrev ? 5 : 3;
          const fill = isCur ? 'var(--n-accent)' : isPrev ? 'var(--n-fg-muted)' : 'var(--n-fg-faint)';
          return (
            <span
              key={iter}
              className="absolute inline-flex items-center justify-center"
              style={{ left: xs[i]! - 8, top: ys[i]! - 8, width: 16, height: 16 }}
              title={`Run #${iter} · ${Math.round(passRates[i]! * 100)}%`}
            >
              <span
                className="rounded-full"
                style={{
                  width: radius * 2,
                  height: radius * 2,
                  background: fill,
                  boxShadow: isCur
                    ? '0 0 0 2px var(--n-bg-surface), 0 0 0 3.5px var(--n-accent)'
                    : 'none',
                }}
              />
            </span>
          );
        })}
      </div>
      <div className="flex flex-shrink-0 gap-3 font-n-mono text-[10px] text-n-faint">
        <LegendDot color="var(--n-fg-muted)" label="prev" />
        <LegendDot color="var(--n-accent)" label="current" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Run summary cards ──────────────────────────────────────────────────────

function RunSummaryCard({
  label,
  accent,
  iteration,
  agg,
}: {
  label: string;
  accent: boolean;
  iteration: number;
  agg: AggregateRow | null;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-n-md border bg-n-raised p-3.5"
      style={{ borderColor: accent ? 'var(--n-accent)' : 'var(--n-border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-n-mono text-[9.5px] font-semibold uppercase tracking-[0.7px]"
          style={{ color: accent ? 'var(--n-accent)' : 'var(--n-fg-faint)' }}
        >
          {label}
        </span>
      </div>
      <div className="text-[16px] font-semibold text-n-fg">Run #{iteration}</div>
      <div className="flex flex-wrap gap-2.5 font-n-mono text-[11px] text-n-muted">
        {agg ? (
          <>
            <span>
              <span className="font-semibold text-n-fg">
                {agg.passed}/{agg.total}
              </span>{' '}
              pass
            </span>
            <span className="text-n-faint">·</span>
            <span>{formatTokens(agg.tokens)}</span>
            <span className="text-n-faint">·</span>
            <span>{formatDuration(agg.durationMs)}</span>
          </>
        ) : (
          <span className="text-n-faint">no data</span>
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const color = delta > 0 ? 'var(--n-healthy)' : delta < 0 ? 'var(--n-critical)' : 'var(--n-fg-muted)';
  return (
    <div className="flex flex-col items-center justify-center font-n-mono">
      <ArrowRight size={18} strokeWidth={2} className="text-n-faint" />
      <div className="mt-1 text-[18px] font-semibold tabular-nums" style={{ color }}>
        {delta > 0 ? '+' : ''}
        {delta}
      </div>
      <div className="text-[9px] uppercase tracking-[0.7px] text-n-faint">pass</div>
    </div>
  );
}

function DiffKPI({
  label,
  prev,
  cur,
  delta,
  tone,
}: {
  label: string;
  prev: string;
  cur: string;
  delta: string | null;
  tone: string;
}) {
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-surface p-3">
      <div className="font-n-mono text-[9.5px] uppercase tracking-[0.7px] text-n-faint">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-n-mono text-[12px] tabular-nums text-n-faint line-through">{prev}</span>
        <ArrowRight size={10} strokeWidth={2} className="text-n-faint" />
        <span className="font-n-mono text-[18px] font-semibold tabular-nums text-n-fg">{cur}</span>
        <span className="flex-1" />
        {delta && (
          <span className="font-n-mono text-[11px] tabular-nums" style={{ color: tone }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Per-eval row (left list) ───────────────────────────────────────────────

function PerEvalRow({
  diff,
  selected,
  onClick,
}: {
  diff: PerEvalDiff;
  selected: boolean;
  onClick(): void;
}) {
  const deltaColor =
    diff.delta > 0
      ? 'var(--n-healthy)'
      : diff.delta < 0
        ? 'var(--n-critical)'
        : 'var(--n-fg-faint)';
  const prevRate = diff.prev ? diff.prev.passRate : 0;
  const curRate = diff.cur ? diff.cur.passRate : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col gap-1.5 rounded-n-md border bg-n-surface px-3 py-2.5 text-left transition-colors hover:bg-n-raised ' +
        (selected ? 'border-n-accent' : 'border-n-border-subtle')
      }
    >
      <div className="flex items-center gap-2">
        {diff.isRegression && <AlertTriangle size={12} strokeWidth={2.25} className="text-n-critical" />}
        <span className="flex-1 truncate font-n-mono text-[12px] text-n-fg">{diff.evalName}</span>
        <span
          className="font-n-mono text-[11px] font-semibold tabular-nums"
          style={{ color: deltaColor }}
        >
          {diff.delta > 0 ? '+' : ''}
          {diff.delta}
        </span>
      </div>
      <DiffBar prev={prevRate} cur={curRate} />
      <div className="flex justify-between font-n-mono text-[10.5px] tabular-nums text-n-faint">
        <span>
          prev{' '}
          {diff.prev ? (
            <>
              {diff.prev.passed}/{diff.prev.total}
            </>
          ) : (
            '—'
          )}
          {' · cur '}
          {diff.cur ? (
            <>
              {diff.cur.passed}/{diff.cur.total}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>
    </button>
  );
}

function DiffBar({ prev, cur }: { prev: number; cur: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1 overflow-hidden rounded-full bg-n-sunken">
        <div className="h-full bg-n-fg-muted opacity-60" style={{ width: `${prev * 100}%` }} />
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-n-sunken">
        <div
          className="h-full"
          style={{
            width: `${cur * 100}%`,
            background: cur >= prev ? 'var(--n-healthy)' : 'var(--n-critical)',
          }}
        />
      </div>
    </div>
  );
}

// ── Drilldown (right) ──────────────────────────────────────────────────────

function AssertionDrilldown({
  evalName,
  baseRequest,
  currentIteration,
  previousIteration,
}: {
  evalName: string;
  baseRequest: GetEvalMatrixRequest;
  currentIteration: number;
  previousIteration: number | null;
}) {
  const { t } = useTranslation('skills');
  const [curArtefact, setCurArtefact] = useState<IterationRunArtifact | null>(null);
  const [prevArtefact, setPrevArtefact] = useState<IterationRunArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurArtefact(null);
    setPrevArtefact(null);

    const reqFor = (iter: number) => ({
      scope: baseRequest.scope,
      projectId: baseRequest.projectId,
      pluginName: baseRequest.pluginName,
      marketplaceName: baseRequest.marketplaceName,
      skillName: baseRequest.skillName,
      iteration: iter,
      evalName,
      config: 'with_skill' as const,
      skillDirOverride: baseRequest.skillDirOverride,
    });

    Promise.all([
      window.nakiros.loadIterationRun(reqFor(currentIteration)),
      previousIteration === null
        ? Promise.resolve(null)
        : window.nakiros
            .loadIterationRun(reqFor(previousIteration))
            .catch(() => null),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setCurArtefact(cur);
        setPrevArtefact(prev);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    evalName,
    currentIteration,
    previousIteration,
    baseRequest.scope,
    baseRequest.projectId,
    baseRequest.pluginName,
    baseRequest.marketplaceName,
    baseRequest.skillName,
    baseRequest.skillDirOverride,
  ]);

  const assertions = useMemo<AssertionDiff[]>(
    () => alignAssertions(curArtefact, prevArtefact),
    [curArtefact, prevArtefact],
  );

  return (
    <div>
      <SectionLabel>
        <span className="font-n-mono normal-case tracking-normal text-n-fg">
          {evalName}
        </span>
        <span className="ml-2 text-n-subtle">·</span>{' '}
        {t('diff.assertions', { defaultValue: 'assertion-by-assertion' })}
      </SectionLabel>

      {error && (
        <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[11.5px] text-n-critical">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="flex items-center gap-2 px-1 font-n-mono text-[11.5px] text-n-muted">
          <RefreshCw size={11} className="animate-spin" />
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      )}

      {!error && !loading && assertions.length === 0 && (
        <div className="rounded-n-md border border-dashed border-n-border-subtle px-4 py-6 text-center font-n-mono text-[11.5px] text-n-faint">
          {t('diff.noAssertion', {
            defaultValue: 'No grading.json available for this eval at these iterations.',
          })}
        </div>
      )}

      {!error && !loading && assertions.length > 0 && (
        <div className="overflow-hidden rounded-n-md border border-n-border-subtle bg-n-surface">
          <div
            className="grid border-b border-n-border-subtle bg-n-sunken px-3.5 py-2.5 font-n-mono text-[10.5px] uppercase tracking-[0.6px] text-n-faint"
            style={{ gridTemplateColumns: '60px 1fr 90px 90px' }}
          >
            <span>id</span>
            <span>assertion</span>
            <span>prev</span>
            <span>cur</span>
          </div>
          {assertions.map((a, i) => (
            <div
              key={i}
              className="grid items-center gap-2 border-b border-n-border-subtle px-3.5 py-2.5 last:border-b-0"
              style={{
                gridTemplateColumns: '60px 1fr 90px 90px',
                background: a.isRegression ? 'oklch(0.74 0.16 25 / 0.06)' : 'transparent',
              }}
            >
              <span className="font-n-mono text-[11px] text-n-faint">A{a.index}</span>
              <span className="text-[12.5px] text-n-fg">
                {a.text}
                {a.isRegression && (
                  <span className="ml-2 font-n-mono text-[9.5px] font-semibold tracking-[0.5px] text-n-critical">
                    REGRESSION
                  </span>
                )}
              </span>
              <AssertionPill state={a.prev} />
              <AssertionPill state={a.cur} />
            </div>
          ))}
        </div>
      )}

      {/* Fixtures + trace diff are intentionally out of scope:
          the daemon doesn't surface fixture-level data through
          IterationRunArtifact, and a faithful port of the trace
          column would need a structured channel. To revisit. */}
    </div>
  );
}

function AssertionPill({ state }: { state: AssertionDiff['prev'] }) {
  if (state === 'missing') {
    return (
      <span className="inline-flex w-fit items-center justify-center rounded-full border border-n-border-subtle bg-n-sunken px-2.5 py-0.5 font-n-mono text-[10.5px] text-n-faint">
        —
      </span>
    );
  }
  const tone = state === 'pass' ? 'healthy' : 'critical';
  return (
    <span
      className="inline-flex w-fit items-center justify-center rounded-full px-2.5 py-0.5 font-n-mono text-[10.5px] font-semibold uppercase tracking-[0.6px]"
      style={{
        background: `var(--n-${tone}-soft)`,
        color: `var(--n-${tone})`,
      }}
    >
      {state}
    </span>
  );
}

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
      <span>{children}</span>
      {right}
    </div>
  );
}

// ── Aggregates / helpers ───────────────────────────────────────────────────

interface AggregateRow {
  passed: number;
  total: number;
  passRate: number;
  tokens: number;
  durationMs: number;
}

function aggregateIterations(matrix: EvalMatrix, indexInMatrix: number): {
  prev: AggregateRow | null;
  cur: AggregateRow | null;
  passDelta: number;
} {
  if (indexInMatrix < 0) return { prev: null, cur: null, passDelta: 0 };
  const cur = aggregateAtIndex(matrix.rows, indexInMatrix);
  const prev = indexInMatrix > 0 ? aggregateAtIndex(matrix.rows, indexInMatrix - 1) : null;
  const passDelta = (cur?.passed ?? 0) - (prev?.passed ?? 0);
  return { prev, cur, passDelta };
}

function aggregateAtIndex(rows: EvalMatrixRow[], idx: number): AggregateRow {
  let passed = 0;
  let total = 0;
  let tokens = 0;
  let durationMs = 0;
  for (const row of rows) {
    const cell = row.withSkill[idx] ?? null;
    if (!cell) continue;
    passed += cell.passed;
    total += cell.total;
    tokens += cell.tokens;
    durationMs += cell.durationMs;
  }
  const passRate = total > 0 ? passed / total : 0;
  return { passed, total, passRate, tokens, durationMs };
}

function alignAssertions(
  cur: IterationRunArtifact | null,
  prev: IterationRunArtifact | null,
): AssertionDiff[] {
  const curResults = cur?.grading?.assertion_results ?? [];
  const prevResults = prev?.grading?.assertion_results ?? [];
  const prevByText = new Map(prevResults.map((r) => [r.text, r]));
  const used = new Set<string>();
  const out: AssertionDiff[] = [];

  curResults.forEach((c, i) => {
    const prevHit = prevByText.get(c.text) ?? null;
    if (prevHit) used.add(c.text);
    const curState: AssertionDiff['cur'] = c.passed ? 'pass' : 'fail';
    const prevState: AssertionDiff['prev'] = prevHit
      ? prevHit.passed
        ? 'pass'
        : 'fail'
      : 'missing';
    out.push({
      index: i + 1,
      text: c.text,
      type: c.type,
      prev: prevState,
      cur: curState,
      isRegression: prevState === 'pass' && curState === 'fail',
    });
  });

  // Surface assertions present in prev but missing in cur.
  prevResults.forEach((p, i) => {
    if (used.has(p.text)) return;
    out.push({
      index: out.length + 1,
      text: p.text,
      type: p.type,
      prev: p.passed ? 'pass' : 'fail',
      cur: 'missing',
      isRegression: p.passed,
    });
  });

  return out;
}

function passRateTone(rate: number): string {
  if (rate >= 0.85) return 'var(--n-healthy)';
  if (rate >= 0.5) return 'var(--n-watch)';
  return 'var(--n-critical)';
}

function signedPct(cur: AggregateRow | null, prev: AggregateRow | null): string | null {
  if (!cur || !prev) return null;
  const diff = Math.round((cur.passRate - prev.passRate) * 100);
  return `${diff >= 0 ? '+' : ''}${diff} pts`;
}

function signedTokens(diff: number): string {
  if (diff === 0) return '±0';
  const formatted = formatTokens(Math.abs(diff));
  return diff > 0 ? `+${formatted}` : `-${formatted}`;
}

function signedDuration(diffMs: number): string {
  const seconds = Math.round(diffMs / 1000);
  if (seconds === 0) return '±0s';
  return seconds > 0 ? `+${seconds}s` : `${seconds}s`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ${seconds % 60}s`;
}
