import { useCallback, useEffect, useState } from 'react';
import type {
  AgentEntry,
  AgentMutationResult,
  CreateAgentRequest,
  SaveAgentRequest,
} from '@nakiros/shared';

interface UseSubagentsApi {
  agents: AgentEntry[];
  loading: boolean;
  error: string | null;
  refresh(): void;
  create(request: CreateAgentRequest): Promise<AgentMutationResult>;
  save(request: SaveAgentRequest): Promise<AgentMutationResult>;
  remove(name: string): Promise<AgentMutationResult>;
}

/** Fetches `.claude/agents/` for a project and exposes mutation helpers
 *  that auto-refresh the list on success. Mirror of `useRules`. */
export function useSubagents(projectId: string): UseSubagentsApi {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.nakiros
      .listClaudeAgents(projectId)
      .then((items) => {
        if (cancelled) return;
        setAgents(items);
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
    async (request: CreateAgentRequest): Promise<AgentMutationResult> => {
      const result = await window.nakiros.createClaudeAgent(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const save = useCallback(
    async (request: SaveAgentRequest): Promise<AgentMutationResult> => {
      const result = await window.nakiros.saveClaudeAgent(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (name: string): Promise<AgentMutationResult> => {
      const result = await window.nakiros.deleteClaudeAgent(projectId, name);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { agents, loading, error, refresh, create, save, remove };
}
