import { useCallback, useEffect, useState } from 'react';
import type {
  AgentEntry,
  AgentMutationResult,
  CreateAgentRequest,
  SaveAgentRequest,
  ConfigurationProvider,
} from '@nakiros/shared';
import { codexAgentEntry, codexResourceDriver, isCodex } from '../../lib/hestia-provider-driver';

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
export function useSubagents(projectId: string, provider: ConfigurationProvider): UseSubagentsApi {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.list(projectId, 'subagents').then(async (summaries) => {
          const results = await Promise.all(
            summaries.map((summary) => codexResourceDriver.read(projectId, 'subagents', summary.id)),
          );
          return results.flatMap((result) => result.ok ? [codexAgentEntry(result.file)] : []);
        })
      : window.nakiros.listClaudeAgents(projectId);
    request
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
  }, [projectId, provider, reloadKey]);

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
