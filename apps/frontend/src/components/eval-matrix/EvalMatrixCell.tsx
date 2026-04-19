import clsx from 'clsx';
import type { EvalMatrixCell as Cell } from '@nakiros/shared';

/**
 * A composite cell showing BOTH configurations stacked:
 *  - top half: with-skill result (primary, full-size, gradient colour)
 *  - bottom half: baseline result (muted, small) — absent if no baseline run
 *
 * Each half is independently clickable → opens the drawer on that config.
 */
export function EvalMatrixCellView({
  withCell,
  withoutCell,
  selected,
  selectedConfig,
  onClickWith,
  onClickWithout,
}: {
  withCell: Cell | null;
  withoutCell: Cell | null;
  selected: boolean;
  selectedConfig: 'with_skill' | 'without_skill' | null;
  onClickWith?: () => void;
  onClickWithout?: () => void;
}) {
  if (!withCell && !withoutCell) {
    return (
      <div
        className="flex h-11 w-16 items-center justify-center rounded border border-dashed border-[var(--line)] text-[10px] text-[var(--text-muted)]"
        title="Not run at this iteration"
      >
        —
      </div>
    );
  }

  return (
    <div className="flex h-11 w-16 shrink-0 flex-col overflow-hidden rounded">
      {/* With-skill top — primary */}
      {withCell ? (
        <button
          onClick={onClickWith}
          title={tooltipFor(withCell, 'with skill')}
          className={clsx(
            'flex h-7 items-center justify-center text-[11px] font-semibold transition-transform hover:scale-[1.03] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
            gradientBg(withCell.passRate),
            selected && selectedConfig === 'with_skill' && 'ring-2 ring-[var(--primary)]',
          )}
        >
          {withCell.passed}/{withCell.total}
        </button>
      ) : (
        <div className="flex h-7 items-center justify-center text-[10px] text-[var(--text-muted)]">—</div>
      )}

      {/* Without-skill bottom — secondary, muted */}
      {withoutCell ? (
        <button
          onClick={onClickWithout}
          title={tooltipFor(withoutCell, 'baseline')}
          className={clsx(
            'flex h-4 items-center justify-center text-[9px] font-medium transition-transform hover:scale-[1.03] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
            mutedBg(withoutCell.passRate),
            selected && selectedConfig === 'without_skill' && 'ring-2 ring-[var(--primary)]',
          )}
        >
          {withoutCell.passed}/{withoutCell.total}
        </button>
      ) : (
        <div className="flex h-4 items-center justify-center text-[9px] text-[var(--text-muted)]/60">
          no base
        </div>
      )}
    </div>
  );
}

function tooltipFor(cell: Cell, label: string): string {
  return `${label}: ${cell.passed}/${cell.total} · ${formatTokens(cell.tokens)} tokens · ${formatDuration(cell.durationMs)}`;
}

/** Red (0%) → orange → yellow → lime → green (100%). */
function gradientBg(passRate: number): string {
  if (passRate >= 1.0) return 'bg-emerald-500/70 text-white';
  if (passRate >= 0.8) return 'bg-emerald-500/40 text-emerald-100';
  if (passRate >= 0.6) return 'bg-yellow-500/40 text-yellow-50';
  if (passRate >= 0.4) return 'bg-orange-500/50 text-orange-50';
  if (passRate > 0) return 'bg-red-500/50 text-red-50';
  return 'bg-red-500/70 text-red-50';
}

/** Muted version of the same palette — for baseline, which is secondary. */
function mutedBg(passRate: number): string {
  if (passRate >= 1.0) return 'bg-emerald-900/50 text-emerald-200';
  if (passRate >= 0.8) return 'bg-emerald-900/30 text-emerald-300';
  if (passRate >= 0.6) return 'bg-yellow-900/30 text-yellow-300';
  if (passRate >= 0.4) return 'bg-orange-900/40 text-orange-300';
  if (passRate > 0) return 'bg-red-900/40 text-red-300';
  return 'bg-red-900/50 text-red-300';
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}t`;
  return `${(n / 1000).toFixed(1)}kt`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}
