import type { AgentRun } from '@nakiros/shared';

type Listener = () => void;

/**
 * Tiny ad-hoc bus used by `RunsCenter` → destination view to express "after
 * the next navigation, focus this run". The destination view consumes the
 * value once on its first skill-load tick and clears it.
 *
 * Intentionally kept off React state so calling code (App.tsx) can fire
 * `set(run)` before triggering the route switch — by the time the new view
 * mounts its effects, the focus is already queued.
 */
let pendingFocus: AgentRun | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Public API surface of the focus bus. */
export const agentRunFocus = {
  /** Queue a focus request — emits to subscribers so a mounted view can react. */
  set(run: AgentRun | null): void {
    pendingFocus = run;
    emit();
  },
  /** Read and clear the queued request. Returns `null` when nothing is pending. */
  consume(): AgentRun | null {
    const r = pendingFocus;
    pendingFocus = null;
    return r;
  },
  /**
   * Read without clearing — for intermediate hosts (e.g. Dashboard) that
   * need to react to the focus before the final consumer takes it. Always
   * pair with a downstream `consume()` so the focus is eventually cleared.
   */
  peek(): AgentRun | null {
    return pendingFocus;
  },
  /** Subscribe to focus mutations — used by views that may already be mounted when focus is set. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
