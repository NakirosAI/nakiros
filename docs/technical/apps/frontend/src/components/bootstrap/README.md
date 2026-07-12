# bootstrap/

**Path:** `apps/frontend/src/components/bootstrap/`

Subcomponents for the Project `.claude` Bootstrap screen
(`views/BootstrapScreen.tsx`) — the plan-review UI (per-entity proposal
cards + approval panel) and the discuss-step chat composer. See
`docs/redesign/features/project-bootstrap.md` for the feature this folder
implements.

## Files

- [BootstrapProposalCard.tsx](./BootstrapProposalCard.md) — One entity proposal from a `ProjectBootstrapPlan` — check/uncheck + inline edit before approval.
- [BootstrapPlanPanel.tsx](./BootstrapPlanPanel.md) — Plan-review panel — cross-entity summary, per-proposal cards, and the global approve/complete action.
- [BootstrapComposer.tsx](./BootstrapComposer.md) — Chat composer for the bootstrap discuss step, native `n-*`-styled equivalent of `HumanInteractionPanel`.
- [proposal-decision.ts](./proposal-decision.md) — `effectiveDecision` — single source of truth for a proposal's current accept/reject state, shared by the panel and `BootstrapScreen.tsx`.
