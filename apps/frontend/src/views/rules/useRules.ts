import { useCallback, useEffect, useState } from 'react';
import type { ConfigurationProvider, CreateRuleRequest, RuleEntry, RuleMutationResult, SaveRuleRequest } from '@nakiros/shared';
import { codexResourceDriver, codexRuleEntry, isCodex } from '../../lib/hestia-provider-driver';

interface UseRulesApi {
  rules: RuleEntry[];
  loading: boolean;
  error: string | null;
  refresh(): void;
  create(request: CreateRuleRequest): Promise<RuleMutationResult>;
  save(request: SaveRuleRequest): Promise<RuleMutationResult>;
  remove(name: string): Promise<RuleMutationResult>;
}

/**
 * Fetches the list of `.claude/rules/` for a project and exposes mutation
 * helpers that automatically refresh the list on success. Mutations return
 * the discriminated `RuleMutationResult` so callers can render in-form errors
 * (conflict, invalid name, …).
 */
export function useRules(projectId: string, provider: ConfigurationProvider): UseRulesApi {
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.list(projectId, 'rules').then(async (summaries) => {
          const results = await Promise.all(
            summaries.map((summary) => codexResourceDriver.read(projectId, 'rules', summary.id)),
          );
          return results.flatMap((result) => result.ok ? [codexRuleEntry(result.file)] : []);
        })
      : window.nakiros.listClaudeRules(projectId);
    request
      .then((items) => {
        if (cancelled) return;
        setRules(items);
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
    async (request: CreateRuleRequest): Promise<RuleMutationResult> => {
      const result = await window.nakiros.createClaudeRule(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const save = useCallback(
    async (request: SaveRuleRequest): Promise<RuleMutationResult> => {
      const result = await window.nakiros.saveClaudeRule(projectId, request);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (name: string): Promise<RuleMutationResult> => {
      const result = await window.nakiros.deleteClaudeRule(projectId, name);
      if (result.ok) refresh();
      return result;
    },
    [projectId, refresh],
  );

  return { rules, loading, error, refresh, create, save, remove };
}
