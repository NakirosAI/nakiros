import { useCallback, useEffect, useState } from 'react';
import type {
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationResult,
  SaveClaudeMdRequest,
} from '@nakiros/shared';

interface UseClaudeMdListApi {
  list: ClaudeMdListResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
}

/** Loads the summary for the project's root CLAUDE.md. */
export function useClaudeMdList(projectId: string): UseClaudeMdListApi {
  const [list, setList] = useState<ClaudeMdListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .listClaudeMd(projectId)
      .then((result) => {
        if (cancelled) return;
        setList(result as ClaudeMdListResult);
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
  return { list, loading, error, refresh };
}

interface UseClaudeMdFileApi {
  file: ClaudeMdFileContent | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(request: SaveClaudeMdRequest): Promise<ClaudeMdMutationResult>;
  remove(): Promise<ClaudeMdMutationResult>;
}

/** Loads the root CLAUDE.md's full content + metadata, with save /
 *  delete helpers that auto-refresh on success. */
export function useClaudeMdFile(
  projectId: string,
  onListChange: () => void,
): UseClaudeMdFileApi {
  const [file, setFile] = useState<ClaudeMdFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .readClaudeMd(projectId)
      .then((result) => {
        if (cancelled) return;
        setFile((result as ClaudeMdFileContent | null) ?? null);
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
    async (request: SaveClaudeMdRequest): Promise<ClaudeMdMutationResult> => {
      const result = await window.nakiros.saveClaudeMdFile(projectId, request);
      if (result.ok) {
        refresh();
        onListChange();
      }
      return result;
    },
    [projectId, refresh, onListChange],
  );

  const remove = useCallback(async (): Promise<ClaudeMdMutationResult> => {
    const result = await window.nakiros.deleteClaudeMd(projectId);
    if (result.ok) {
      refresh();
      onListChange();
    }
    return result;
  }, [projectId, refresh, onListChange]);

  return { file, loading, error, refresh, save, remove };
}
