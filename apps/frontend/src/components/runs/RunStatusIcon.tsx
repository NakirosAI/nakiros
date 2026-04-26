import {
  CheckCircle,
  Loader2,
  MessageSquare,
  Square,
  XCircle,
} from 'lucide-react';
import type { RunBadgeStatus } from './RunStatusBadge';

interface Props {
  status: RunBadgeStatus;
  /** Pixel size of the icon — `sm` = 14px, `lg` = 18px. Defaults to `sm`. */
  size?: 'sm' | 'lg';
}

/**
 * Icon-only variant of {@link RunStatusBadge} for tight spaces (run lists,
 * compact detail headers). Carries the same colour semantics; pair it with
 * a label nearby when context is needed.
 */
export function RunStatusIcon({ status, size = 'sm' }: Props) {
  const sz = size === 'lg' ? 18 : 14;
  switch (status) {
    case 'completed':
    case 'done':
      return <CheckCircle size={sz} className="text-emerald-400" />;
    case 'failed':
      return <XCircle size={sz} className="text-red-400" />;
    case 'stopped':
    case 'cancelled':
      return <Square size={sz} className="text-[var(--text-muted)]" />;
    case 'waiting_for_input':
    case 'awaiting_input':
      return <MessageSquare size={sz} className="text-amber-400" />;
    case 'running':
    case 'starting':
    case 'grading':
      return <Loader2 size={sz} className="animate-spin text-[var(--primary)]" />;
    case 'queued':
    case 'pending':
    default:
      return <span className="inline-block h-3 w-3 rounded-full border border-[var(--line-strong)]" />;
  }
}
