import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  CheckCircle,
  Loader2,
  MessageSquare,
  Square,
  XCircle,
} from 'lucide-react';

/**
 * Union of every status string emitted by Nakiros runners (audit / fix / create
 * / eval) plus the unified `AgentRunStatus`. The badge handles them all so any
 * caller can pass its native runner status as-is.
 */
export type RunBadgeStatus =
  | 'queued'
  | 'pending'
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'awaiting_input'
  | 'grading'
  | 'completed'
  | 'done'
  | 'failed'
  | 'stopped'
  | 'cancelled';

interface Props {
  status: RunBadgeStatus;
  className?: string;
}

interface Conf {
  icon: React.ReactNode;
  className: string;
}

function configFor(status: RunBadgeStatus): Conf {
  switch (status) {
    case 'completed':
    case 'done':
      return {
        icon: <CheckCircle size={12} />,
        className: 'bg-emerald-500/20 text-emerald-400',
      };
    case 'failed':
      return {
        icon: <XCircle size={12} />,
        className: 'bg-red-500/20 text-red-400',
      };
    case 'stopped':
    case 'cancelled':
      return {
        icon: <Square size={12} />,
        className: 'bg-[var(--bg-muted)] text-[var(--text-muted)]',
      };
    case 'waiting_for_input':
    case 'awaiting_input':
      return {
        icon: <MessageSquare size={12} />,
        className: 'bg-amber-500/20 text-amber-400',
      };
    case 'queued':
    case 'pending':
      return {
        icon: <Loader2 size={12} />,
        className: 'bg-[var(--bg-muted)] text-[var(--text-muted)]',
      };
    case 'starting':
    case 'running':
    case 'grading':
    default:
      return {
        icon: <Loader2 size={12} className="animate-spin" />,
        className: 'bg-[var(--primary-soft)] text-[var(--primary)]',
      };
  }
}

/**
 * Pill displaying a run's lifecycle status with the right icon, colour and
 * translated label. Status labels live in the shared `runs` i18n namespace so
 * every run kind shares the same vocabulary.
 */
export function RunStatusBadge({ status, className }: Props) {
  const { t } = useTranslation('runs');
  const conf = configFor(status);
  const label = t(`status.${status}` as const, { defaultValue: status });

  return (
    <span
      className={clsx(
        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        conf.className,
        className,
      )}
    >
      {conf.icon}
      {label}
    </span>
  );
}
