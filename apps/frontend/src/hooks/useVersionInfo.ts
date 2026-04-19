import { useEffect, useRef, useState } from 'react';
import type { VersionInfo } from '@nakiros/shared';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // re-check every hour while the app is open

/**
 * Shared hook — every consumer triggers one fetch on mount + a periodic refresh.
 * The daemon caches the npm response for 6h, so multiple consumers won't hit the
 * registry. `null` while the first fetch is in flight.
 */
export function useVersionInfo(): VersionInfo | null {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;

    async function refresh() {
      try {
        const next = await window.nakiros.getVersionInfo();
        if (!cancelled) setInfo(next);
      } catch {
        // Silent — offline or daemon hiccup. We'll retry on the next tick.
      }
    }

    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      aliveRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return info;
}
