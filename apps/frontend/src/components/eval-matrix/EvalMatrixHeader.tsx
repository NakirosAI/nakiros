import type { ReactElement } from 'react';
import { AlertTriangle, CheckCircle, Sparkles, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { EvalMatrixMetrics } from '@nakiros/shared';

/**
 * Top strip of the matrix: sparkline of aggregated pass-rate, tag summary,
 * and token delta vs baseline. Compact, stays pinned above the grid.
 */
export function EvalMatrixHeader({ metrics }: { metrics: EvalMatrixMetrics }) {
  const lastPassRate = metrics.passRateByIteration[metrics.passRateByIteration.length - 1] ?? 0;
  const prevPassRate = metrics.passRateByIteration[metrics.passRateByIteration.length - 2] ?? null;
  const passRateDelta = prevPassRate !== null ? lastPassRate - prevPassRate : null;

  const lastTokens = metrics.tokensByIteration[metrics.tokensByIteration.length - 1] ?? null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-xs">
      {/* Pass rate sparkline */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-muted)]">pass rate</span>
        <Sparkline values={metrics.passRateByIteration} />
        <span className="font-semibold text-[var(--text-primary)]">{formatPct(lastPassRate)}</span>
        {passRateDelta !== null && (
          <span
            className={
              passRateDelta > 0.01
                ? 'text-emerald-400'
                : passRateDelta < -0.01
                  ? 'text-red-400'
                  : 'text-[var(--text-muted)]'
            }
          >
            ({passRateDelta >= 0 ? '+' : ''}
            {formatPct(passRateDelta)})
          </span>
        )}
      </div>

      {/* Tokens last iteration */}
      {lastTokens && (
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <span>tokens</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {formatTokens(lastTokens.withSkill)}
          </span>
          {lastTokens.delta !== null && (
            <span className={lastTokens.delta > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              (Δ {lastTokens.delta >= 0 ? '+' : ''}
              {formatTokens(lastTokens.delta)})
            </span>
          )}
        </div>
      )}

      {/* Tag counts */}
      <div className="ml-auto flex items-center gap-2">
        {metrics.tagCounts.broken > 0 && (
          <TagCount icon={<TrendingDown size={10} />} label={`${metrics.tagCounts.broken} broken`} className="bg-red-500/20 text-red-400" />
        )}
        {metrics.tagCounts.flaky > 0 && (
          <TagCount icon={<AlertTriangle size={10} />} label={`${metrics.tagCounts.flaky} flaky`} className="bg-amber-500/20 text-amber-400" />
        )}
        {metrics.tagCounts.fixed > 0 && (
          <TagCount icon={<TrendingUp size={10} />} label={`${metrics.tagCounts.fixed} fixed`} className="bg-emerald-500/20 text-emerald-400" />
        )}
        {metrics.tagCounts.new > 0 && (
          <TagCount icon={<Sparkles size={10} />} label={`${metrics.tagCounts.new} new`} className="bg-sky-500/20 text-sky-400" />
        )}
        {metrics.tagCounts.noisy > 0 && (
          <TagCount icon={<Zap size={10} />} label={`${metrics.tagCounts.noisy} noisy`} className="bg-slate-500/20 text-slate-400" />
        )}
        {metrics.tagCounts.stable > 0 && (
          <TagCount icon={<CheckCircle size={10} />} label={`${metrics.tagCounts.stable} stable`} className="bg-emerald-500/10 text-emerald-400" />
        )}
      </div>
    </div>
  );
}

function TagCount({ icon, label, className }: { icon: ReactElement; label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${className}`}>
      {icon}
      {label}
    </span>
  );
}

/**
 * Simple SVG sparkline. Normalises values to [0,1] domain, draws polyline.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 60;
  const height = 16;
  const xs = values.map((_, i) => (i / (values.length - 1)) * width);
  const ys = values.map((v) => height - v * height);
  const points = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-[var(--primary)]"
      />
    </svg>
  );
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function formatTokens(n: number): string {
  if (Math.abs(n) < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}
