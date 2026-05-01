import { useCallback, useEffect, useState } from 'react';
import type {
  PermissionsFileContent,
  PermissionsMutationResult,
  PermissionsScope,
  SavePermissionsRequest,
} from '@nakiros/shared';

interface UsePermissionsApi {
  file: PermissionsFileContent | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(request: SavePermissionsRequest): Promise<PermissionsMutationResult>;
}

/** Reads `.claude/settings.json` (or `.local`) and exposes a typed save
 *  helper. Re-runs on `scope` change so switching project/local pulls a
 *  fresh snapshot with the right mtime token. */
export function usePermissions(projectId: string, scope: PermissionsScope): UsePermissionsApi {
  const [file, setFile] = useState<PermissionsFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .readClaudePermissions(projectId, scope)
      .then((result) => {
        if (cancelled) return;
        setFile((result as PermissionsFileContent | null) ?? null);
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
    async (request: SavePermissionsRequest): Promise<PermissionsMutationResult> => {
      const result = await window.nakiros.saveClaudePermissions(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { file, loading, error, refresh, save };
}
