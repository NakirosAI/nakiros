# BootstrapProposalCard.tsx

**Path:** `apps/frontend/src/components/bootstrap/BootstrapProposalCard.tsx`

One entity proposal from a `ProjectBootstrapPlan` — check/uncheck + inline
edit before approval, matching the reco-cards UX pattern
(`components/recommendations/RecoCard.tsx`) per the Project `.claude`
Bootstrap feature's plan-review decision
(`docs/redesign/features/project-bootstrap.md` §2-3). Diverges from
`RecoCard` in two ways: the primary action is a persistent accept/reject
toggle (not Apply/Dismiss buttons — the user checks entities across the
whole plan before one global Approve), and content is editable inline
rather than via a confirm modal, since the plan already gates the write
behind the approval step.

## Exports

### `BootstrapProposalCard`

```ts
export function BootstrapProposalCard(props: Props): JSX.Element
```

Renders the header (accept/reject toggle or written/failed badge, artifact
type + target chip, title), the rationale, and the content — either a
`MarkdownViewer` preview (JSON-shaped artefacts wrapped in a fenced
` ```json ` block for highlighting) or an inline editable textarea toggled
via the Edit/Preview button. Post-approval (`written`/`failed` status)
locks editing and swaps the toggle for a result icon plus the write path
or error message.

**Props** (`Props`, not exported — local to this file):
- `proposal` — the `BootstrapEntityProposal` to render.
- `decision` — local accept/reject choice for this proposal.
- `editedContent` — local inline-edit override, or `undefined` if untouched.
- `onToggleDecision(id)` — flips the accept/reject decision.
- `onEditContent(id, content)` — records an inline edit.
- `locked` — `true` once the plan is no longer editable (`executing` or terminal run).
