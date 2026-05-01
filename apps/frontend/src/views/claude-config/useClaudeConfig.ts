import { useCallback, useEffect, useState } from 'react';
import type { ClaudeConfigSnapshot } from '@nakiros/shared';

interface UseClaudeConfigState {
  snapshot: ClaudeConfigSnapshot | null;
  loading: boolean;
  error: string | null;
  reload(): void;
}

/**
 * Fetches a project's `.claude/` snapshot via the `claudeConfig:scan` IPC and
 * keeps it in component state. Re-runs on `projectId` change.
 */
export function useClaudeConfig(projectId: string): UseClaudeConfigState {
  const [snapshot, setSnapshot] = useState<ClaudeConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .scanClaudeConfig(projectId)
      .then((result) => {
        if (cancelled) return;
        setSnapshot((result as ClaudeConfigSnapshot | null) ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { snapshot, loading, error, reload };
}
