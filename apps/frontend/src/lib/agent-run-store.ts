import type { AgentRun, AgentRunKind, AgentRunStatus } from '@nakiros/shared';

type Listener = () => void;

const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  'done',
  'failed',
  'cancelled',
]);

const DISMISSED_STORAGE_KEY = 'nakiros.dismissedRunIds';

/**
 * Module-scoped store holding every `AgentRun` the UI cares about — both
 * active runs (mirrored from the daemon) and recently-terminal runs the
 * user hasn't dismissed yet. Adapters poll the daemon for their own kind
 * and call `syncKind(kind, runs)` with the **full** kind set (active +
 * recently terminal); runs marked dismissed by the user are filtered out
 * before they're upserted, so the daemon re-emitting a completed run on
 * the next tick (or after a restart) doesn't make it reappear.
 *
 * Dismissal is explicit and persisted in localStorage — survives reloads
 * and daemon restarts. Run ids carry timestamps so the set stays bounded
 * in practice.
 */
const runs = new Map<string, AgentRun>();
const listeners = new Set<Listener>();
let snapshotCache: AgentRun[] = [];
const dismissedIds = loadDismissedFromStorage();

function loadDismissedFromStorage(): Set<string> {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function persistDismissed(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify(Array.from(dismissedIds)),
    );
  } catch {
    // storage full / disabled — silent fallback (in-memory only this session)
  }
}

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
   * Reconcile the store with the daemon's full set for `kind` (active +
   * recently terminal as returned by `*.listAll`). Dismissed run ids are
   * filtered out before any upsert, so a dismissed completed run never
   * reappears on the next polling tick or after a daemon restart.
   *
   * Existing runs of the same kind that disappear from `incoming` and
   * were still active in our store are transitioned to `done` — guards
   * against the rare case where the daemon evicts a run before it has
   * surfaced its terminal status.
   */
  syncKind(kind: AgentRunKind, incoming: AgentRun[]): void {
    const accepted = incoming.filter((r) => !dismissedIds.has(r.id));
    const incomingIds = new Set(accepted.map((r) => r.id));

    for (const existing of runs.values()) {
      if (existing.kind !== kind) continue;
      if (incomingIds.has(existing.id)) continue;
      if (isTerminal(existing.status)) continue;
      runs.set(existing.id, {
        ...existing,
        status: 'done',
        endedAt: existing.endedAt ?? new Date().toISOString(),
      });
    }

    for (const run of accepted) {
      runs.set(run.id, run);
    }

    emit();
  },

  /** Remove one run from the store and remember it as dismissed across reloads. */
  dismiss(id: string): void {
    const had = runs.delete(id);
    dismissedIds.add(id);
    persistDismissed();
    if (had) emit();
  },

  /** Remove every terminal run from the store and persist the dismissal. */
  dismissAllTerminal(): void {
    let changed = false;
    for (const run of runs.values()) {
      if (isTerminal(run.status)) {
        runs.delete(run.id);
        dismissedIds.add(run.id);
        changed = true;
      }
    }
    if (changed) {
      persistDismissed();
      emit();
    }
  },

  /** Empty the store — used in tests and on full-reset scenarios. */
  clear(): void {
    if (runs.size === 0) return;
    runs.clear();
    emit();
  },
};
