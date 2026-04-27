import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
import type {
  EvalMatrix,
  EvalMatrixCell,
  EvalMatrixRow,
  GetEvalMatrixRequest,
  IterationRunArtifact,
  Skill,
} from '@nakiros/shared';

interface EvalDiffOverlayProps {
  /** Matrix the diff is computed from. */
  matrix: EvalMatrix;
  /** Skill — used to read iteration timestamps from `skill.evals.iterations`. */
  skill: Skill;
  /** The iteration the user clicked. Seeds the local "current" state. */
  initialIteration: number;
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
  /** Grader-produced evidence for the cur run, when available. */
  evidenceCur: string | null;
  /** Same for the prev run. */
  evidencePrev: string | null;
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
  skill,
  initialIteration,
  baseRequest,
  onClose,
}: EvalDiffOverlayProps) {
  const { t } = useTranslation('skills');

  // Both runs are user-controllable via the RunPicker pills in the
  // header. They seed from the iteration the user clicked + its
  // immediate predecessor in the matrix.
  const seedIndex = matrix.iterations.indexOf(initialIteration);
  const seedPrev = seedIndex > 0 ? matrix.iterations[seedIndex - 1] ?? null : null;
  const [curIter, setCurIter] = useState<number>(initialIteration);
  const [prevIter, setPrevIter] = useState<number | null>(seedPrev);

  // Re-anchor when the user opens the overlay from a different cell.
  useEffect(() => {
    setCurIter(initialIteration);
    const idx = matrix.iterations.indexOf(initialIteration);
    setPrevIter(idx > 0 ? matrix.iterations[idx - 1] ?? null : null);
  }, [initialIteration, matrix.iterations]);

  const indexInMatrix = matrix.iterations.indexOf(curIter);
  const previousIteration = prevIter;
  const previousIndex = previousIteration === null ? -1 : matrix.iterations.indexOf(previousIteration);

  const [selectedEval, setSelectedEval] = useState<string | null>(null);
  const [regressionsOnly, setRegressionsOnly] = useState(false);

  // Pre-compute pass rates per iteration so the picker can show
  // X/Y · % at a glance for each run row. Baseline iterations have no
  // `withSkill` cells — fall back to `withoutSkill` so the picker
  // surfaces a useful number for them too.
  const passByIter = useMemo(() => {
    const map = new Map<number, { passed: number; total: number; passRate: number }>();
    matrix.iterations.forEach((iter, idx) => {
      const isBaseline = matrix.kinds[idx] === 'baseline';
      let passed = 0;
      let total = 0;
      for (const row of matrix.rows) {
        const cell = isBaseline ? row.withoutSkill[idx] : row.withSkill[idx];
        if (!cell) continue;
        passed += cell.passed;
        total += cell.total;
      }
      map.set(iter, {
        passed,
        total,
        passRate: total > 0 ? passed / total : 0,
      });
    });
    return map;
  }, [matrix]);

  // Per-iteration kind, pre-indexed for the picker dropdown.
  const kindByIter = useMemo(() => {
    const map = new Map<number, 'skill' | 'baseline'>();
    matrix.iterations.forEach((iter, idx) => {
      map.set(iter, matrix.kinds[idx] ?? 'skill');
    });
    return map;
  }, [matrix]);

  // Map iteration → ISO timestamp from skill.evals.iterations.
  const timestampByIter = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const it of skill.evals?.iterations ?? []) {
      map.set(it.number, it.timestamp);
    }
    return map;
  }, [skill]);

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
      const prev = previousIndex < 0 ? null : row.withSkill[previousIndex] ?? null;
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
  }, [matrix, indexInMatrix, previousIndex]);

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

  const aggregates = useMemo(
    () => aggregateIterations(matrix, indexInMatrix, previousIndex),
    [matrix, indexInMatrix, previousIndex],
  );

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
        <div className="flex flex-col gap-1.5">
          <div className="font-n-mono text-[10.5px] uppercase tracking-[0.6px] text-n-faint">
            Eval diff
          </div>
          <div className="flex items-center gap-2">
            <RunPicker
              role="prev"
              selected={previousIteration}
              counterpart={curIter}
              iterations={matrix.iterations}
              passByIter={passByIter}
              timestampByIter={timestampByIter}
              kindByIter={kindByIter}
              onChange={setPrevIter}
            />
            <ArrowRight size={13} strokeWidth={2} className="text-n-faint" />
            <RunPicker
              role="cur"
              selected={curIter}
              counterpart={previousIteration}
              iterations={matrix.iterations}
              passByIter={passByIter}
              timestampByIter={timestampByIter}
              kindByIter={kindByIter}
              onChange={(iter) => iter !== null && setCurIter(iter)}
            />
          </div>
        </div>
        <span className="flex-1" />
      </header>

      {/* Top: history + side-by-side cards + KPIs */}
      <div className="flex-shrink-0 px-6 pb-3 pt-5">
        <RunHistorySparkline
          iterations={matrix.iterations}
          passRates={matrix.metrics.passRateByIteration}
          kinds={matrix.kinds}
          currentIteration={curIter}
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
            iteration={curIter}
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
              currentIteration={curIter}
              previousIteration={previousIteration}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Run picker (header pills) ──────────────────────────────────────────────

interface PassInfo {
  passed: number;
  total: number;
  passRate: number;
}

interface RunPickerProps {
  /** `prev` accepts null (no comparison); `cur` always selects something. */
  role: 'prev' | 'cur';
  selected: number | null;
  /** The iteration the OTHER picker holds — flagged as "OTHER" in the dropdown. */
  counterpart: number | null;
  iterations: number[];
  passByIter: Map<number, PassInfo>;
  timestampByIter: Map<number, string | null>;
  /**
   * Per-iteration kind. Baseline iterations show a small "BASELINE" tag
   * in the dropdown so the user can intentionally compare a skill run
   * against a baseline run.
   */
  kindByIter: Map<number, 'skill' | 'baseline'>;
  onChange(iteration: number | null): void;
}

/**
 * Pill picker shown twice in the diff overlay header. Replaces the
 * static "Run #N-1 → Run #N" text from an earlier draft (the mockup
 * actually exposes both runs as dropdowns so the user can compare any
 * pair of iterations, not just adjacent ones).
 *
 * The pill shows: status dot · Run #N · pass rate %. Clicking it opens
 * a dropdown listing every iteration in the matrix with its
 * timestamp/age, X/Y pass count and pass rate. The iteration the other
 * picker is on is labelled OTHER and disabled (clicking it would put
 * the same run on both sides).
 */
function RunPicker({
  role,
  selected,
  counterpart,
  iterations,
  passByIter,
  timestampByIter,
  kindByIter,
  onChange,
}: RunPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const dotColor = role === 'cur' ? 'var(--n-accent)' : 'var(--n-fg-muted)';
  const accentBorder = role === 'cur' ? 'var(--n-accent-line)' : 'var(--n-border-default)';

  const selectedPass = selected !== null ? passByIter.get(selected) : null;
  const selectedRatePct = selectedPass ? Math.round(selectedPass.passRate * 100) : null;
  const selectedKind = selected !== null ? kindByIter.get(selected) : undefined;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          'inline-flex h-7 items-center gap-2 rounded-n-sm border px-2.5 font-n-mono text-[12px] text-n-fg transition-colors ' +
          (open ? 'bg-n-raised ' : 'bg-transparent hover:bg-n-raised ')
        }
        style={{ borderColor: accentBorder }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
        {selected === null ? (
          <span className="text-n-faint">{role === 'prev' ? 'no previous' : '—'}</span>
        ) : (
          <>
            <span className="font-semibold">Run #{selected}</span>
            {selectedKind === 'baseline' && <BaselineTag />}
            {selectedRatePct !== null && (
              <span className="text-n-muted">{selectedRatePct}%</span>
            )}
          </>
        )}
        <ChevronDown
          size={11}
          strokeWidth={2.25}
          className={'text-n-subtle transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-[340px] overflow-hidden rounded-n-md border border-n-border-default bg-n-surface shadow-n-pop">
          <div className="border-b border-n-border-subtle px-3.5 py-2 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            Pick a run
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {role === 'prev' && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className={
                  'flex w-full items-center px-3.5 py-2 text-left transition-colors hover:bg-n-raised ' +
                  (selected === null ? 'bg-n-accent-soft' : '')
                }
              >
                <span className="font-n-mono text-[12px] text-n-faint">— no comparison</span>
              </button>
            )}
            {[...iterations].reverse().map((iter) => {
              const pass = passByIter.get(iter);
              const ratePct = pass ? Math.round(pass.passRate * 100) : null;
              const ts = timestampByIter.get(iter) ?? null;
              const isSelected = selected === iter;
              const isCounterpart = counterpart === iter;
              return (
                <button
                  key={iter}
                  type="button"
                  disabled={isCounterpart}
                  onClick={() => {
                    if (isCounterpart) return;
                    onChange(iter);
                    setOpen(false);
                  }}
                  className={
                    'grid w-full grid-cols-[64px_1fr_72px_56px_56px] items-center gap-2 px-3.5 py-2 text-left transition-colors ' +
                    (isSelected
                      ? 'bg-n-accent-soft'
                      : isCounterpart
                        ? 'cursor-not-allowed bg-transparent'
                        : 'bg-transparent hover:bg-n-raised')
                  }
                >
                  <span
                    className={
                      'flex items-center gap-1.5 font-n-mono text-[13px] font-semibold ' +
                      (isCounterpart ? 'text-n-faint opacity-50' : 'text-n-fg')
                    }
                  >
                    #{iter}
                    {kindByIter.get(iter) === 'baseline' && <BaselineTag />}
                  </span>
                  <span
                    className={
                      'font-n-mono text-[11px] ' +
                      (isCounterpart ? 'text-n-faint opacity-50' : 'text-n-muted')
                    }
                  >
                    {formatRunWhen(ts)}
                  </span>
                  <span
                    className={
                      'font-n-mono text-[11px] tabular-nums ' +
                      (isCounterpart ? 'text-n-faint opacity-50' : 'text-n-fg')
                    }
                  >
                    {pass ? `${pass.passed}/${pass.total}` : '—'}
                  </span>
                  <span
                    className="font-n-mono text-[11px] tabular-nums"
                    style={{
                      color: isCounterpart ? 'var(--n-fg-faint)' : passRateTone(pass?.passRate ?? 0),
                    }}
                  >
                    {ratePct !== null ? `${ratePct}%` : '—'}
                  </span>
                  <span className="text-right">
                    {isCounterpart && (
                      <span className="font-n-mono text-[9.5px] uppercase tracking-[0.6px] text-n-faint">
                        OTHER
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Format an ISO timestamp into the compact form used by the mockup
 * dropdown (HH:MM today / yesterday / Nd ago / explicit date).
 */
function formatRunWhen(iso: string | null): string {
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
  return ts.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

// ── Run history sparkline ──────────────────────────────────────────────────

function RunHistorySparkline({
  iterations,
  passRates,
  kinds,
  currentIteration,
  previousIteration,
}: {
  iterations: number[];
  passRates: number[];
  /** Aligned to `iterations` — baseline iters get a violet dot. */
  kinds: ReadonlyArray<'skill' | 'baseline'>;
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
          const isBaseline = kinds[i] === 'baseline';
          const radius = isCur || isPrev ? 5 : 3;
          // Baseline runs always render in the violet marker colour to
          // match the inline matrix sparkline. Selection state still
          // wins for size + ring (so the user can see the selected run
          // clearly even when it's a baseline).
          const fill = isBaseline
            ? 'oklch(0.62 0.21 295)'
            : isCur
              ? 'var(--n-accent)'
              : isPrev
                ? 'var(--n-fg-muted)'
                : 'var(--n-fg-faint)';
          return (
            <span
              key={iter}
              className="absolute inline-flex items-center justify-center"
              style={{ left: xs[i]! - 8, top: ys[i]! - 8, width: 16, height: 16 }}
              title={
                `Run #${iter}` +
                (isBaseline ? ' · baseline' : '') +
                ` · ${Math.round(passRates[i]! * 100)}%`
              }
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
        <LegendDot color="oklch(0.62 0.21 295)" label="baseline" />
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

/**
 * Pill flagging an iteration as a baseline-only refresh in the diff
 * picker. Kept neutral (violet to match the sparkline marker colour) so
 * it reads as "this run was the baseline" rather than as a status badge.
 */
function BaselineTag() {
  return (
    <span
      className="rounded-n-xs px-1 py-px font-n-mono text-[8.5px] font-semibold uppercase tracking-[0.6px]"
      style={{
        background: 'oklch(0.62 0.21 295 / 0.18)',
        color: 'oklch(0.78 0.16 295)',
      }}
    >
      baseline
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

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
            style={{ gridTemplateColumns: '24px 60px 1fr 90px 90px' }}
          >
            <span />
            <span>id</span>
            <span>assertion</span>
            <span>prev</span>
            <span>cur</span>
          </div>
          {assertions.map((a) => {
            const isOpen = expanded.has(a.index);
            const hasEvidence = !!a.evidenceCur || !!a.evidencePrev;
            return (
              <AssertionRowCollapsible
                key={a.index}
                assertion={a}
                open={isOpen}
                onToggle={() => toggleExpand(a.index)}
                hasEvidence={hasEvidence}
              />
            );
          })}
        </div>
      )}

      {/* Fixtures + trace diff are intentionally out of scope:
          the daemon doesn't surface fixture-level data through
          IterationRunArtifact, and a faithful port of the trace
          column would need a structured channel. To revisit. */}
    </div>
  );
}

function AssertionRowCollapsible({
  assertion,
  open,
  onToggle,
  hasEvidence,
}: {
  assertion: AssertionDiff;
  open: boolean;
  onToggle(): void;
  hasEvidence: boolean;
}) {
  const headerBg = assertion.isRegression
    ? 'oklch(0.74 0.16 25 / 0.06)'
    : open
      ? 'var(--n-bg-raised)'
      : 'transparent';
  return (
    <div className="border-b border-n-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasEvidence}
        className="grid w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-n-raised disabled:cursor-default disabled:hover:bg-transparent"
        style={{ gridTemplateColumns: '24px 60px 1fr 90px 90px', background: headerBg }}
      >
        <span className="flex items-center justify-center text-n-subtle">
          {hasEvidence ? (
            open ? (
              <ChevronDown size={12} strokeWidth={2.25} />
            ) : (
              <ChevronRight size={12} strokeWidth={2.25} />
            )
          ) : (
            <span className="h-1 w-1 rounded-full bg-n-faint" />
          )}
        </span>
        <span className="font-n-mono text-[11px] text-n-faint">A{assertion.index}</span>
        <span className="text-[12.5px] text-n-fg">
          {assertion.text}
          {assertion.isRegression && (
            <span className="ml-2 font-n-mono text-[9.5px] font-semibold tracking-[0.5px] text-n-critical">
              REGRESSION
            </span>
          )}
        </span>
        <AssertionPill state={assertion.prev} />
        <AssertionPill state={assertion.cur} />
      </button>

      {open && hasEvidence && (
        <div className="grid border-t border-n-border-subtle bg-n-canvas px-3.5 py-3" style={{ gridTemplateColumns: '24px 60px 1fr' }}>
          <span />
          <TypeBadge type={assertion.type} />
          <div className="space-y-2">
            {assertion.evidenceCur && (
              <EvidenceBlock label="cur" tone="accent" text={assertion.evidenceCur} />
            )}
            {assertion.evidencePrev && (
              <EvidenceBlock label="prev" tone="muted" text={assertion.evidencePrev} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: AssertionDiff['type'] }) {
  return (
    <span
      className="inline-flex h-fit w-fit items-center rounded-n-xs border border-n-border-subtle bg-n-sunken px-1.5 py-0.5 font-n-mono text-[9.5px] uppercase tracking-[0.5px] text-n-muted"
      title={`Assertion type: ${type}`}
    >
      {type}
    </span>
  );
}

function EvidenceBlock({
  label,
  tone,
  text,
}: {
  label: string;
  tone: 'accent' | 'muted';
  text: string;
}) {
  const labelColor = tone === 'accent' ? 'var(--n-accent)' : 'var(--n-fg-muted)';
  return (
    <div>
      <div
        className="mb-1 font-n-mono text-[9.5px] uppercase tracking-[0.6px]"
        style={{ color: labelColor }}
      >
        {label}
      </div>
      <pre className="whitespace-pre-wrap rounded-n-sm border border-n-border-subtle bg-n-sunken px-2.5 py-2 font-n-mono text-[11px] leading-snug text-n-muted">
        {text}
      </pre>
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

function aggregateIterations(
  matrix: EvalMatrix,
  curIndex: number,
  prevIndex: number,
): {
  prev: AggregateRow | null;
  cur: AggregateRow | null;
  passDelta: number;
} {
  if (curIndex < 0) return { prev: null, cur: null, passDelta: 0 };
  const cur = aggregateAtIndex(matrix.rows, curIndex);
  const prev = prevIndex >= 0 ? aggregateAtIndex(matrix.rows, prevIndex) : null;
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
      evidenceCur: c.evidence || null,
      evidencePrev: prevHit?.evidence || null,
    });
  });

  // Surface assertions present in prev but missing in cur.
  prevResults.forEach((p) => {
    if (used.has(p.text)) return;
    out.push({
      index: out.length + 1,
      text: p.text,
      type: p.type,
      prev: p.passed ? 'pass' : 'fail',
      cur: 'missing',
      isRegression: p.passed,
      evidenceCur: null,
      evidencePrev: p.evidence || null,
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
