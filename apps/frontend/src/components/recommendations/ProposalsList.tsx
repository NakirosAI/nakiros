import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Loader2, RefreshCw } from 'lucide-react';

import type { Proposal, ProposalsNewEvent } from '@nakiros/shared';

import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ProposalCard } from './ProposalCard';

interface Props {
  projectId: string;
}

export function ProposalsList({ projectId }: Props) {
  const { t } = useTranslation('recommendations');
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await window.nakiros.listProposals({ projectId });
      setProposals(response.proposals);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setRefreshing(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-update when the daemon broadcasts a proposal change for *this* project.
  useEffect(() => {
    const unsubscribe = window.nakiros.onProposalsNew((event: ProposalsNewEvent) => {
      if (event.proposal.projectId !== projectId) return;
      setProposals((current) => {
        if (!current) return [event.proposal];
        // Dedupe by id — the engine uses INSERT OR REPLACE so events can repeat.
        const without = current.filter((p) => p.id !== event.proposal.id);
        return [event.proposal, ...without];
      });
    });
    return unsubscribe;
  }, [projectId]);

  function handleUpdated(updated: Proposal): void {
    setProposals((current) =>
      current ? current.map((p) => (p.id === updated.id ? updated : p)) : [updated],
    );
  }

  const isLoading = proposals === null && !error;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-[var(--text-primary,var(--text))]">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-[var(--text-muted)]">{t('subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing}
          aria-label={t('refresh')}
        >
          {refreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {t('refresh')}
        </Button>
      </div>

      {error && (
        <div
          className="rounded-md border border-[var(--danger)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" />
          {t('loading')}
        </div>
      ) : proposals && proposals.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={20} />}
          title={t('empty.title')}
          subtitle={t('empty.subtitle')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {proposals?.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onChange={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
