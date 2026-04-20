import type { AuditRunStatus, EvalRunStatus } from '@nakiros/shared';

/**
 * True when a run is in a non-terminal, resumable state — i.e. worth
 * rebinding a fresh client to instead of starting a brand new run.
 * Excludes `queued` and `grading` (eval-only transient states) by design.
 */
export function isActiveRunStatus(status: AuditRunStatus | EvalRunStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'waiting_for_input';
}
