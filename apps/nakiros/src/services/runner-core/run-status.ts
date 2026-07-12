import type { AuditRunStatus, BootstrapRunStatus, EvalRunStatus } from '@nakiros/shared';

/**
 * True when a run is in a non-terminal, resumable state — i.e. worth
 * rebinding a fresh client to instead of starting a brand new run.
 * Excludes `queued` and `grading` (eval-only transient states) by design.
 *
 * `awaiting_approval` / `executing` (bootstrap-only) count as active: both
 * are "resting, no live Claude subprocess" states just like
 * `waiting_for_input` — the bootstrap run is still meaningfully in progress
 * and worth rebinding a client to.
 */
export function isActiveRunStatus(status: AuditRunStatus | EvalRunStatus | BootstrapRunStatus): boolean {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'waiting_for_input' ||
    status === 'awaiting_approval' ||
    status === 'executing'
  );
}
