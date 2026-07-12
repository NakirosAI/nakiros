# RunScreen.tsx

**Path:** `apps/frontend/src/views/RunScreen.tsx`

Full-screen view that hosts an in-flight or completed agent run, dispatched
by `runKind`. `eval` routes to `EvalRunScreen` (a batch of `SkillEvalRun`s
doesn't fit the single-run `getRun(id)` pattern); `edit` / `fix` / `create`
route to the 3-pane `IdeRunScreen`; everything else (`audit`,
`classify-convo`, `recommendation-analyze`, …) renders through the internal
`AuditLikeRunScreen`, which wires `useRunState` against `lib/run-api.ts`'s
`getRunAPI(runKind)`.

`bootstrap` is a member of `AgentRunKind` (for `RunDock` purposes) but is
never actually passed as `runKind` here in practice: `NewShell.handleOpenRun`
intercepts bootstrap `AgentRun`s before they'd open a `kind: 'run'` tab and
routes them to `views/BootstrapScreen.tsx`'s project-tab view instead — its
`awaiting_approval` / `executing` statuses and `plan` field don't fit this
screen's audit-shaped header/report rendering. The internal `mapAuditStatus`
helper still accepts `BootstrapRunStatus` (folding `awaiting_approval` /
`executing` into `awaiting_input` / `running`) purely so the wider
`AuditLikeRun` union (which now includes `BootstrapRun`) type-checks —
dead code in normal operation, kept for defense-in-depth if that routing
guarantee is ever bypassed. The module-local `composeTitle` helper likewise
carries a `titles.bootstrap` entry in its `labelByKind` map for the same
defense-in-depth reason — if a bootstrap run ever did land here, the tab
title would read "Project Bootstrap" instead of the raw `'bootstrap'`
kind string.

## Exports

### `RunScreen` (default export)

```ts
export default function RunScreen(props: RunScreenProps): JSX.Element
```

**Props** (`RunScreenProps`, not exported — local to this file):
- `runId` — run id from the agent run store.
- `runKind` — discriminator; drives which IPC channels are subscribed to.
- `onClose()` — closes the tab.
- `onOpenRunTab?` — opens a follow-up run tab (used by completed-eval recaps).
