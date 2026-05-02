import { useCallback, useEffect, useState } from 'react';
import type {
  CreateMcpServerRequest,
  McpInfo,
  McpMutationResult,
  SaveMcpServerRequest,
} from '@nakiros/shared';

interface UseMcpApi {
  info: McpInfo | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  create(request: CreateMcpServerRequest): Promise<McpMutationResult>;
  save(request: SaveMcpServerRequest): Promise<McpMutationResult>;
  remove(name: string, mtimeAtRead: string): Promise<McpMutationResult>;
}

/** Fetches `.mcp.json` snapshot via the project-wide scan and exposes
 *  per-server mutation helpers. */
export function useMcp(projectId: string): UseMcpApi {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .listClaudeMcp(projectId)
      .then((result) => {
        if (cancelled) return;
        setInfo((result as McpInfo | null) ?? null);
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
    async (request: CreateMcpServerRequest): Promise<McpMutationResult> => {
      const result = await window.nakiros.createClaudeMcpServer(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const save = useCallback(
    async (request: SaveMcpServerRequest): Promise<McpMutationResult> => {
      const result = await window.nakiros.saveClaudeMcpServer(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (name: string, mtimeAtRead: string): Promise<McpMutationResult> => {
      const result = await window.nakiros.deleteClaudeMcpServer(projectId, name, mtimeAtRead);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { info, loading, error, refresh, create, save, remove };
}
