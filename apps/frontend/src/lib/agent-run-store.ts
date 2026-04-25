import type { AgentRun, AgentRunKind, AgentRunStatus } from '@nakiros/shared';

type Listener = () => void;

const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  'done',
  'failed',
  'cancelled',
]);

/**
 * Module-scoped store holding every `AgentRun` the UI cares about — both
 * active runs (mirrored from the daemon) and recently-terminal runs the
 * user hasn't dismissed yet. Adapters poll the daemon for their own kind
 * and call `syncKind(kind, active)` with the **active set**; runs missing
 * from that set are not deleted, they're transitioned to `done` so the
 * topbar can flag "something just finished".
 *
 * Dismissal is explicit: the user clicks an X (or "mark all as read"), and
 * the run is removed from the store. No timed eviction.
 */
const runs = new Map<string, AgentRun>();
const listeners = new Set<Listener>();
let snapshotCache: AgentRun[] = [];

function rebuildSnapshot(): void {
  snapshotCache = Array.from(runs.values());
}

function emit(): void {
  rebuildSnapshot();
  for (const fn of listeners) fn();
}

/** True for `'done' | 'failed' | 'cancelled'`. */
export function isTerminal(status: AgentRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Public store API. */
export const agentRunStore = {
  /** Subscribe to any change. Returns the unsubscribe handle. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /** Latest stable snapshot for `useSyncExternalStore`. */
  getActiveSnapshot(): AgentRun[] {
    return snapshotCache;
  },

  /** Look up one run by id. Returns the same reference between mutations. */
  get(id: string): AgentRun | undefined {
    return runs.get(id);
  },

  /**
   * Reconcile the store with the daemon's active set for `kind`:
   *   - Runs in `active` are upserted (same id → updated; new id → added).
   *   - Existing runs of `kind` not in `active` are **kept** but transitioned
   *     to `done` if they were still in a non-terminal status. This is how
   *     "the run just finished" surfaces in the runs center without losing
   *     the entry the moment the daemon drops it from the active list.
   *   - Runs of other kinds are untouched — multiple adapters cohabit.
   */
  syncKind(kind: AgentRunKind, active: AgentRun[]): void {
    const activeIds = new Set(active.map((r) => r.id));

    for (const existing of runs.values()) {
      if (existing.kind !== kind) continue;
      if (activeIds.has(existing.id)) continue;
      if (isTerminal(existing.status)) continue;
      // Was active in our store, no longer reported by the daemon → assume done.
      runs.set(existing.id, {
        ...existing,
        status: 'done',
        endedAt: existing.endedAt ?? new Date().toISOString(),
      });
    }

    for (const run of active) {
      runs.set(run.id, run);
    }

    emit();
  },

  /** Remove one run from the store (user clicked the dismiss X). */
  dismiss(id: string): void {
    if (runs.delete(id)) emit();
  },

  /** Remove every terminal run (user clicked "clear completed"). */
  dismissAllTerminal(): void {
    let changed = false;
    for (const run of runs.values()) {
      if (isTerminal(run.status)) {
        runs.delete(run.id);
        changed = true;
      }
    }
    if (changed) emit();
  },

  /** Empty the store — used in tests and on full-reset scenarios. */
  clear(): void {
    if (runs.size === 0) return;
    runs.clear();
    emit();
  },
};
