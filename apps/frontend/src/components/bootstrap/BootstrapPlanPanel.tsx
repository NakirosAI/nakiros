import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, MessageSquareText, RefreshCw, Sparkles } from 'lucide-react';
import type { BootstrapRunStatus, ProjectBootstrapPlan } from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';
import { BootstrapProposalCard } from './BootstrapProposalCard';
import { effectiveDecision, type ProposalDecisions, type ProposalEdits } from './proposal-decision';

export type { ProposalDecisions, ProposalEdits };

interface Props {
  plan: ProjectBootstrapPlan;
  status: BootstrapRunStatus;
  decisions: ProposalDecisions;
  edits: ProposalEdits;
  onToggleDecision(id: string): void;
  onEditContent(id: string, content: string): void;
  onApprove(): void;
  approving: boolean;
}

/**
 * Plan-review panel — the validation step of the bootstrap flow (feature
 * doc §"Flow" step 3). Renders the cross-entity `summary`, then one
 * {@link BootstrapProposalCard} per proposal so the user can check/uncheck
 * and edit entity by entity before a single global approve action
 * (`bootstrap:approvePlan`), enabled whenever the run is `waiting_for_input`
 * OR `awaiting_approval` — the user can keep discussing the plan (which
 * flips the run to `waiting_for_input` for a turn) without losing the
 * ability to approve the last known plan; the daemon accepts the call in
 * either status. When the plan is empty (`proposals: []` — the skill's
 * prescribed output for an already well-configured project), the same
 * action is relabelled "Complete" since there's nothing to write, only the
 * run to close out cleanly.
 *
 * Once approved the run moves to `executing` — the per-entity writer
 * dispatch runs synchronously as part of that step, so `executing` is
 * normally a brief transitional state before `completed` / `failed` rather
 * than something the user has to wait around for.
 */
export function BootstrapPlanPanel({
  plan,
  status,
  decisions,
  edits,
  onToggleDecision,
  onEditContent,
  onApprove,
  approving,
}: Props) {
  const { t } = useTranslation('bootstrap');

  const isEmpty = plan.proposals.length === 0;
  const acceptedCount = plan.proposals.filter((p) => effectiveDecision(p, decisions) === 'accepted').length;
  const isApprovable = status === 'waiting_for_input' || status === 'awaiting_approval';
  const canApprove = isApprovable && !approving;
  const isExecuting = status === 'executing';
  const isPostApproval = isExecuting || status === 'completed' || status === 'failed' || status === 'stopped';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-n-border-subtle px-4 py-3">
        <div className="flex items-center gap-1.5 font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          <Sparkles size={12} strokeWidth={2} />
          {t('plan.title', { defaultValue: 'Configuration plan' })}
        </div>
        <div className="mt-1.5 text-[12px] leading-relaxed text-n-muted">
          <MarkdownViewer content={plan.summary} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-n-mono text-[10.5px] text-n-faint">
          <span>
            {t('plan.acceptedCount', {
              defaultValue: '{{accepted}}/{{total}} included',
              accepted: acceptedCount,
              total: plan.proposals.length,
            })}
          </span>
          {plan.usedFrictionDigests && (
            <span className="inline-flex items-center gap-1 rounded-n-xs bg-n-accent-soft px-1.5 py-0.5 text-n-accent">
              <MessageSquareText size={10} strokeWidth={2} />
              {t('plan.usedFrictionDigests', { defaultValue: 'informed by conversation frictions' })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {plan.proposals.length === 0 && (
          <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-6 text-center font-n-mono text-[11.5px] text-n-muted">
            {t('plan.empty', {
              defaultValue: 'Nothing to propose — the project is already well configured.',
            })}
          </div>
        )}
        {plan.proposals.map((proposal) => (
          <BootstrapProposalCard
            key={proposal.id}
            proposal={proposal}
            decision={effectiveDecision(proposal, decisions)}
            editedContent={edits[proposal.id]}
            onToggleDecision={onToggleDecision}
            onEditContent={onEditContent}
            locked={isPostApproval}
          />
        ))}
      </div>

      <div className="flex-shrink-0 border-t border-n-border-subtle px-4 py-3">
        {isApprovable && (
          <button
            type="button"
            disabled={!canApprove}
            onClick={onApprove}
            className={
              'flex w-full items-center justify-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12.5px] text-n-accent-strong ' +
              (canApprove ? 'hover:bg-n-accent-soft/80' : 'cursor-not-allowed opacity-50')
            }
          >
            {approving ? (
              <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
            ) : isEmpty ? (
              <CheckCircle2 size={13} strokeWidth={2} />
            ) : (
              <Sparkles size={13} strokeWidth={2} />
            )}
            {approving
              ? t(isEmpty ? 'plan.completing' : 'plan.approving', {
                  defaultValue: isEmpty ? 'Completing…' : 'Approving…',
                })
              : t(isEmpty ? 'plan.complete' : 'plan.approve', {
                  defaultValue: isEmpty ? 'Complete' : 'Approve & write',
                })}
          </button>
        )}
        {isExecuting && (
          <div className="flex items-start gap-2 rounded-n-md border border-n-watch/30 bg-n-watch-soft px-3 py-2.5 text-[11.5px] leading-snug text-n-watch">
            <Loader2 size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0 animate-spin" />
            <span>
              {t('plan.executingBanner', {
                defaultValue: 'Writing approved entities to the project…',
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
