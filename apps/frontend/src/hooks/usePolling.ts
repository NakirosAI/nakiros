import { useEffect, useRef } from 'react';

/** Optional behavior tweaks for {@link usePolling}. */
export interface UsePollingOptions {
  /** Set `false` to suspend polling without unmounting. Default: `true`. */
  enabled?: boolean;
  /** Run `fn` once immediately before starting the interval. Default: `true`. */
  immediate?: boolean;
}

/**
 * Run `fn` every `intervalMs` while the component is mounted. The hook keeps
 * a ref to the latest `fn` so callers can pass an inline closure without
 * restarting the timer on every render.
 *
 * The hook only guarantees that **no new** invocation runs after unmount. An
 * inflight async `fn` is the caller's concern — guard state updates with a
 * `cancelled` flag in the closure if needed.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, immediate = true }: UsePollingOptions = {},
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    if (immediate) void fnRef.current();
    const id = setInterval(() => void fnRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, immediate, intervalMs]);
}
