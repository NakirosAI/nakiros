import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatComputeDuration, formatTokens } from '../../utils/format';
import { RunStatusBadge, type RunBadgeStatus } from './RunStatusBadge';

interface Props {
  /** Lifecycle status of the run — drives the badge. */
  status: RunBadgeStatus;
  /** Run title (e.g. `Audit — my-skill`). Already translated by the caller. */
  title: ReactNode;
  /** Small icon shown left of the title (e.g. <Sparkles />). */
  icon?: ReactNode;
  /** Cumulative tokens used by the underlying agent process. */
  tokensUsed?: number;
  /**
   * Live elapsed ms while the run is active, final `durationMs` once terminal.
   * The header doesn't decide which one — pass the value the caller wants
   * displayed.
   */
  durationMs: number;
  /** Closes the run view (Back button). */
  onBack(): void;
  /**
   * Kind-specific action buttons rendered between the stats and the optional
   * `extras` slot — e.g. Stop / Finish / Sync / Discard. Receives no props,
   * the caller wires its own handlers and visibility.
   */
  actions?: ReactNode;
  /**
   * Trailing slot for kind-specific UI on the right edge of the header
   * (e.g. AuditView's tab switcher). Rendered after the actions.
   */
  extras?: ReactNode;
  /**
   * Optional slot rendered immediately after the status badge — used by
   * callers to surface secondary badges such as `RunInterruptedBadge`
   * without having to re-implement the header layout.
   */
  badgeExtras?: ReactNode;
}

/**
 * Top header shared across every run view. Lays out the Back button + icon +
 * title + {@link RunStatusBadge} on the left, and the tokens / elapsed stats
 * + caller-defined actions / extras on the right.
 */
export function RunControlHeader({
  status,
  title,
  icon,
  tokensUsed,
  durationMs,
  onBack,
  actions,
  extras,
  badgeExtras,
}: Props) {
  const { t } = useTranslation('runs');
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        {t('back')}
      </button>
      {icon}
      <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
      <RunStatusBadge status={status} />
      {badgeExtras}

      <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>{formatTokens(tokensUsed ?? 0, { unit: 'tok' })}</span>
        <span>·</span>
        <span>{formatComputeDuration(durationMs)}</span>
        {actions}
        {extras}
      </div>
    </div>
  );
}
