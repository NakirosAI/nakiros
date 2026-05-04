import { useCallback, useEffect, useState } from 'react';
import type { HooksAuditHistoryEntry, HooksExpertMutationResult, HooksReadResult } from '@nakiros/shared';

interface UseHooksFileApi {
  file: HooksReadResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(content: string, mtimeAtRead: string): Promise<HooksExpertMutationResult>;
}

/**
 * Loads the project's hooks block (from `.claude/settings.json`) as a raw
 * JSON string via the hooks-expert IPC. Exposes a `save` helper that
 * round-trips only the hooks slice while preserving all other settings keys.
 *
 * Mirrors {@link useClaudeMdFile} in shape so `HooksScreen` can follow the
 * exact same pattern as `ClaudeMdScreen`.
 */
export function useHooksFile(
  projectId: string,
  onRefreshAudits?: () => void,
): UseHooksFileApi {
  const [file, setFile] = useState<HooksReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .readHooks(projectId)
      .then((result) => {
        if (cancelled) return;
        setFile((result as HooksReadResult | null) ?? null);
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

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (content: string, mtimeAtRead: string): Promise<HooksExpertMutationResult> => {
      const result = await window.nakiros.saveHooks(projectId, content, mtimeAtRead);
      if (result.ok) {
        refresh();
        onRefreshAudits?.();
      }
      return result;
    },
    [projectId, refresh, onRefreshAudits],
  );

  return { file, loading, error, refresh, save };
}

// Re-export for convenience — screens that only need the audit list can use
// this directly instead of duplicating the fetch logic.
export type { HooksAuditHistoryEntry };
