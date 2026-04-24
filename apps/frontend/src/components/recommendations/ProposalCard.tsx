import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Plus,
  Wrench,
  X,
} from 'lucide-react';

import type { Proposal, ProposalStatus } from '@nakiros/shared';

import { Badge, type BadgeVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { ProposalDiffView } from './ProposalDiffView';

interface Props {
  proposal: Proposal;
  onChange(updated: Proposal): void;
}

const STATUS_VARIANT: Record<ProposalStatus, BadgeVariant> = {
  draft: 'muted',
  eval_running: 'info',
  eval_done: 'info',
  accepted: 'success',
  rejected: 'danger',
};

export function ProposalCard({ proposal, onChange }: Props) {
  const { t, i18n } = useTranslation('recommendations');
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<null | 'accept' | 'reject' | 'runEval'>(null);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = proposal.status === 'accepted' || proposal.status === 'rejected';

  async function runAction(
    action: 'accept' | 'reject' | 'runEval',
    fn: () => Promise<Proposal | unknown>,
    errorKey: 'accept' | 'reject' | 'runEval',
  ): Promise<void> {
    setPending(action);
    setError(null);
    try {
      const result = await fn();
      // accept / reject return a Proposal; runEval returns a RunComparisonResponse.
      // For runEval, re-fetch the proposal to pick up the updated status.
      if (action === 'runEval') {
        const refreshed = await window.nakiros.getProposal({ id: proposal.id });
        if (refreshed) onChange(refreshed);
      } else if (result && typeof result === 'object' && 'id' in result) {
        onChange(result as Proposal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(`card.errors.${errorKey}`));
    } finally {
      setPending(null);
    }
  }

  const title =
    proposal.type === 'new' ? t('card.typeNew') : `${t('card.typePatch')}: ${proposal.targetSkill ?? '—'}`;
  const frictionsLabel = t('card.frictionsLabel', { count: proposal.frictionIds.length });
  const scoreDisplay = proposal.score.toFixed(1);
  const dateStr = new Date(proposal.createdAt).toLocaleDateString(i18n.language);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              {proposal.type === 'new' ? (
                <Plus size={16} className="text-[var(--primary)]" />
              ) : (
                <Wrench size={16} className="text-[var(--primary)]" />
              )}
              <span className="truncate text-base font-semibold text-[var(--text-primary,var(--text))]">
                {title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <Badge variant={STATUS_VARIANT[proposal.status]}>
                {t(`card.status.${proposal.status}`)}
              </Badge>
              <span>
                {t('card.scoreLabel')}: <span className="font-medium">{scoreDisplay}</span>
              </span>
              <span>•</span>
              <span>{frictionsLabel}</span>
              <span>•</span>
              <span>{dateStr}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!isTerminal && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  runAction(
                    'runEval',
                    () => window.nakiros.runProposalEval({ id: proposal.id }),
                    'runEval',
                  )
                }
                disabled={pending !== null || proposal.status === 'eval_running'}
              >
                {pending === 'runEval' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FlaskConical size={14} />
                )}
                {t('card.actions.runEval')}
              </Button>
            )}
            {!isTerminal && (
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  runAction(
                    'accept',
                    () => window.nakiros.acceptProposal({ id: proposal.id }),
                    'accept',
                  )
                }
                disabled={pending !== null}
              >
                {pending === 'accept' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                {t('card.actions.accept')}
              </Button>
            )}
            {!isTerminal && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  runAction(
                    'reject',
                    () => window.nakiros.rejectProposal({ id: proposal.id }),
                    'reject',
                  )
                }
                disabled={pending !== null}
              >
                {pending === 'reject' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
                {t('card.actions.reject')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? t('card.actions.collapse') : t('card.actions.expand')}
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="flex flex-col gap-4 border-t border-[var(--line)] bg-[var(--bg-soft)]">
          <div className="flex flex-col gap-2 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('card.draftHeader')}
            </h4>
            <ProposalDiffView proposal={proposal} />
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('card.evalCasesHeader')}
            </h4>
            <ul className="flex flex-col gap-2">
              {proposal.draft.evalCases.map((ec, i) => (
                <li
                  key={`${ec.name}-${i}`}
                  className="rounded-md border border-[var(--line)] bg-[var(--bg-card,var(--bg))] p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary,var(--text))]">
                      {ec.name}
                    </span>
                    <Badge variant={ec.fromFriction ? 'info' : 'muted'}>
                      {ec.fromFriction
                        ? t('card.evalCaseFromFriction')
                        : t('card.evalCaseSynthetic')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[var(--text-muted)]">{ec.prompt}</p>
                  {ec.expectation && (
                    <p className="mt-1 italic text-[var(--text-muted)]">→ {ec.expectation}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
