import { useEffect, useRef, useState } from 'react';

/**
 * Tick `elapsed` = now − startedAt every 500ms. Anchored on the real start
 * time so reopening a view mid-run doesn't reset the counter to zero.
 */
export function useElapsedTimer(startedAtIso: string): number {
  const startTime = useRef(new Date(startedAtIso).getTime());
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Date.now() - startTime.current),
  );
  useEffect(() => {
    const interval = setInterval(
      () => setElapsed(Date.now() - startTime.current),
      500,
    );
    return () => clearInterval(interval);
  }, []);
  return elapsed;
}
