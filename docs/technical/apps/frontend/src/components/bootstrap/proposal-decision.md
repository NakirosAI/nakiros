# proposal-decision.ts

**Path:** `apps/frontend/src/components/bootstrap/proposal-decision.ts`

Single source of truth for the local (pre-approval) accept/reject state of
a `BootstrapEntityProposal` during the Project `.claude` Bootstrap plan
review (`docs/redesign/features/project-bootstrap.md`). Extracted after a
review found `BootstrapScreen.tsx`'s `toggleDecision`, `BootstrapPlanPanel`'s
render path, and `BootstrapScreen.tsx`'s `handleApprove` each computing
"what's the current decision for this proposal" slightly differently —
`toggleDecision` defaulted a missing entry to plain `'accepted'`, while the
other two defaulted to the proposal's own `status` (so an agent-`rejected`
proposal defaulted to `'rejected'`). The mismatch meant a first click on an
already agent-rejected proposal was a visual no-op.

## Exports

### `ProposalDecisions`

```ts
export type ProposalDecisions = Record<string, 'accepted' | 'rejected'>
```

Local (pre-approval) accept/reject choice per proposal id, keyed by
`BootstrapEntityProposal.id`. Missing entries resolve via `effectiveDecision`.

### `ProposalEdits`

```ts
export type ProposalEdits = Record<string, string>
```

Local inline-edit override per proposal id — takes precedence over
`proposal.content` until approval.

### `effectiveDecision`

```ts
export function effectiveDecision(
  proposal: Pick<BootstrapEntityProposal, 'id' | 'status'>,
  decisions: ProposalDecisions,
): 'accepted' | 'rejected'
```

Folds in the local override (`decisions[proposal.id]`) and falls back to
the proposal's own persisted `status` (`rejected` → `'rejected'`, anything
else → `'accepted'`) rather than a blanket default. Used by
`BootstrapPlanPanel` (its `acceptedCount` tally and each card's `decision`
prop) and by `BootstrapScreen.tsx` (`toggleDecision` computes the next
value from this, and `handleApprove`'s payload builder) — the three call
sites can no longer disagree on a proposal's current decision.
