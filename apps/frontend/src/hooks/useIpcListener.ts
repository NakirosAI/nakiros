import { useEffect, useRef, type DependencyList } from 'react';

type SubscribeFn<T> = (handler: (payload: T) => void) => (() => void);

/**
 * Wraps a `subscribe` IPC channel (one that returns its own unsubscribe
 * function) into a React-friendly side effect. Resubscribes when `enabled`,
 * `subscribe`, or any `deps` change. The latest `handler` is captured via a
 * ref so callers don't need to memoize it. No-op when `subscribe` is nullish
 * or `enabled` is false.
 */
export function useIpcListener<T>(
  subscribe: SubscribeFn<T> | null | undefined,
  handler: (payload: T) => void,
  deps: DependencyList = [],
  enabled = true,
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || !subscribe) return;
    const unsubscribe = subscribe((payload: T) => {
      handlerRef.current(payload);
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, subscribe, ...deps]);
}
