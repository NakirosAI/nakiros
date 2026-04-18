import { useEffect, useRef, type DependencyList } from 'react';

type SubscribeFn<T> = (handler: (payload: T) => void) => (() => void);

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
