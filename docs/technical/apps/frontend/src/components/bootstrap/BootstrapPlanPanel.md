# BootstrapPlanPanel.tsx

**Path:** `apps/frontend/src/components/bootstrap/BootstrapPlanPanel.tsx`

Plan-review panel — the validation step of the bootstrap flow
(`docs/redesign/features/project-bootstrap.md` "Flow" step 3). Renders the
cross-entity plan `summary`, then one `BootstrapProposalCard` per proposal
so the user can check/uncheck and edit entity by entity before a single
global approve action (`bootstrap:approvePlan`), enabled whenever the run
is `waiting_for_input` OR `awaiting_approval` — the user can keep
discussing the plan without losing the ability to approve the last known
one; the daemon accepts the call in either status. When the plan is empty
(`proposals: []` — the skill's prescribed output for an already
well-configured project), the same action is relabelled "Complete" (i18n
`plan.complete`/`plan.completing`) instead of being force-disabled, since
there's nothing to write, only the run to close out cleanly.

Once approved the run moves to `executing` — the writer dispatch runs
synchronously as part of that step, so this is normally a brief
transitional banner (`plan.executingBanner`) rather than a long wait.

`acceptedCount` and each card's `decision` prop both go through
`effectiveDecision` (`./proposal-decision.ts`) rather than computing their
own default — see that module's doc for why a naive `decisions[id] ??
'accepted'` fallback is wrong.

## Exports

### `ProposalDecisions` / `ProposalEdits`

Re-exported from `./proposal-decision.ts` (their canonical home) so
existing importers of this file don't need to change.

### `BootstrapPlanPanel`

```ts
export function BootstrapPlanPanel(props: Props): JSX.Element
```

**Props** (`Props`, not exported — local to this file):
- `plan` — the `ProjectBootstrapPlan` to render.
- `status` — current `BootstrapRunStatus`, drives which controls/banners show.
- `decisions` / `edits` — local per-proposal state, lifted to the caller.
- `onToggleDecision(id)` / `onEditContent(id, content)` — forwarded to each card.
- `onApprove()` — triggers `bootstrap:approvePlan` with the current decisions.
- `approving` — `true` while the approve call is in flight.
