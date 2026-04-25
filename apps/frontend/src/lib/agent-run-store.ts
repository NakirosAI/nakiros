import type { AgentRun, AgentRunKind } from '@nakiros/shared';

type Listener = () => void;

/**
 * Tiny module-scoped store holding every active `AgentRun` regardless of its
 * `kind` (audit / eval / fix / create / future). Adapters poll the daemon for
 * their own kind and call `syncKind(kind, next)` to mirror the active set.
 *
 * Store is intentionally minimal — no zustand, no redux, just a `Map` plus
 * `useSyncExternalStore` consumers in the corresponding hooks.
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

/**
 * Public accessor surface — methods kept on a single object so consumers
 * import one symbol (`agentRunStore`) and the React hooks reference its
 * `subscribe` / `getSnapshot` directly.
 */
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
   * Replace the active set for `kind` with `next`. Existing runs of `kind`
   * absent from `next` are removed; runs in `next` are upserted. Runs of
   * other kinds are untouched — multiple adapters cohabit safely.
   */
  syncKind(kind: AgentRunKind, next: AgentRun[]): void {
    const nextIds = new Set(next.map((r) => r.id));
    for (const existing of runs.values()) {
      if (existing.kind === kind && !nextIds.has(existing.id)) {
        runs.delete(existing.id);
      }
    }
    for (const run of next) {
      runs.set(run.id, run);
    }
    emit();
  },

  /** Empty the store — used in tests and on full-reset scenarios. */
  clear(): void {
    runs.clear();
    emit();
  },
};
