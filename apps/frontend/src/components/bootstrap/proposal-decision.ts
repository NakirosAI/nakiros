import type { BootstrapEntityProposal } from '@nakiros/shared';

/** Local (pre-approval) accept/reject choice per proposal id, keyed by {@link BootstrapEntityProposal.id}. Missing entries resolve via {@link effectiveDecision}. */
export type ProposalDecisions = Record<string, 'accepted' | 'rejected'>;
/** Local inline-edit override per proposal id — takes precedence over `proposal.content` until approval. */
export type ProposalEdits = Record<string, string>;

/**
 * Single source of truth for "what is the current accept/reject decision
 * for this proposal" — folds in the local pre-approval override
 * (`decisions[proposal.id]`) and falls back to the proposal's own
 * persisted `status` rather than a blanket `'accepted'`. A proposal the
 * agent already produced as `rejected` (or, post-approval, `written` /
 * `failed`) must default to that state, not to `accepted`.
 *
 * Used by every site that reads or mutates a decision — the render path
 * (`BootstrapPlanPanel`'s `acceptedCount` and its per-card `decision`
 * prop) and the toggle/approve handlers in `BootstrapScreen.tsx` — so
 * they can never disagree. Before this helper existed, `toggleDecision`
 * defaulted missing entries to plain `'accepted'` while the render path
 * and the approve payload used the status-aware default: the first click
 * on an agent-rejected proposal was a visual no-op (it flipped an
 * already-effectively-rejected proposal to `'rejected'` again).
 */
export function effectiveDecision(
  proposal: Pick<BootstrapEntityProposal, 'id' | 'status'>,
  decisions: ProposalDecisions,
): 'accepted' | 'rejected' {
  return decisions[proposal.id] ?? (proposal.status === 'rejected' ? 'rejected' : 'accepted');
}
