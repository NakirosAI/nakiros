import { useCallback, useEffect, useState } from 'react';
import type {
  HooksFileContent,
  HooksMutationResult,
  PermissionsScope,
  SaveHooksRequest,
} from '@nakiros/shared';

interface UseHooksApi {
  file: HooksFileContent | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(request: SaveHooksRequest): Promise<HooksMutationResult>;
}

/** Reads `.claude/settings.json` (or `.local`) hooks block + provides a save
 *  helper. Re-runs on `scope` change so switching project/local pulls a
 *  fresh snapshot with the right mtime token. */
export function useHooks(projectId: string, scope: PermissionsScope): UseHooksApi {
  const [file, setFile] = useState<HooksFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .readClaudeHooks(projectId, scope)
      .then((result) => {
        if (cancelled) return;
        setFile((result as HooksFileContent | null) ?? null);
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
  }, [projectId, scope, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (request: SaveHooksRequest): Promise<HooksMutationResult> => {
      const result = await window.nakiros.saveClaudeHooks(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { file, loading, error, refresh, save };
}
