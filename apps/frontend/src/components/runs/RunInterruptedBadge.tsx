import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Small amber badge surfaced next to {@link RunStatusBadge} when a run was
 * collapsed back to `waiting_for_input` after a daemon reboot rather than
 * having genuinely asked for user input. Pairs with the "Reprendre" action
 * in {@link RunControlHeader} so the user knows they can resume the
 * interrupted conversation.
 *
 * The component renders nothing when `interrupted` is falsy — let callers
 * pass `run.interruptedByReboot` directly without a guard.
 */
export function RunInterruptedBadge({ interrupted }: { interrupted: boolean | undefined }) {
  const { t } = useTranslation('runs');
  if (!interrupted) return null;
  return (
    <span
      title={t('interruptedTooltip')}
      className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400"
    >
      <AlertTriangle size={12} />
      {t('interruptedBadge')}
    </span>
  );
}
