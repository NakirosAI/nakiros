import { useCallback, useEffect, useState } from 'react';
import type {
  CreateOutputStyleRequest,
  OutputStyleEntry,
  OutputStyleMutationResult,
  OutputStylesListResult,
  SaveOutputStyleRequest,
} from '@nakiros/shared';

interface UseOutputStylesApi {
  styles: OutputStyleEntry[];
  activeName: string | null;
  activeSource: OutputStylesListResult['activeSource'];
  loading: boolean;
  error: string | null;
  refresh(): void;
  create(request: CreateOutputStyleRequest): Promise<OutputStyleMutationResult>;
  save(request: SaveOutputStyleRequest): Promise<OutputStyleMutationResult>;
  remove(name: string): Promise<OutputStyleMutationResult>;
}

/** Fetches `.claude/output-styles/` list + currently selected style. */
export function useOutputStyles(projectId: string): UseOutputStylesApi {
  const [styles, setStyles] = useState<OutputStyleEntry[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [activeSource, setActiveSource] =
    useState<OutputStylesListResult['activeSource']>('none');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .listClaudeOutputStyles(projectId)
      .then((result) => {
        if (cancelled) return;
        setStyles(result.items);
        setActiveName(result.activeName);
        setActiveSource(result.activeSource);
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

  const create = useCallback(
    async (request: CreateOutputStyleRequest): Promise<OutputStyleMutationResult> => {
      const result = await window.nakiros.createClaudeOutputStyle(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const save = useCallback(
    async (request: SaveOutputStyleRequest): Promise<OutputStyleMutationResult> => {
      const result = await window.nakiros.saveClaudeOutputStyle(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (name: string): Promise<OutputStyleMutationResult> => {
      const result = await window.nakiros.deleteClaudeOutputStyle(projectId, name);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { styles, activeName, activeSource, loading, error, refresh, create, save, remove };
}
