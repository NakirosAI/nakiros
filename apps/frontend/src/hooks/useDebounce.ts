import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms have
 * passed without further changes. Each new input cancels the pending timeout
 * via `window.clearTimeout`. Useful for search inputs and rate-limited filters.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
