# EvalRunsView.tsx

**Path:** `apps/frontend/src/views/EvalRunsView.tsx`

Full-screen overlay for a batch of skill eval runs (one iteration, possibly with/without baseline pairs and across multiple models for comparisons). Polls `window.nakiros.listEvalRuns` every 500 ms while runs are active, also subscribing to `onEvalEvent` for live text/tool stream rendering. Splits the UI into a left run list (grouped by model + eval, paired with baseline) and a `RunDetail` pane with conversation, generated outputs (`listEvalRunOutputs` + `readEvalRunOutput`), sandbox diff (`readEvalRunDiffPatch`), and a per-eval human feedback textarea persisted via `getEvalFeedback` / `saveEvalFeedback`. Lets the user reply to a `waiting_for_input` run, stop individual runs or all, and finish a run with `finishEvalRun`. Mounted from `*SkillsView` and from `FixView` (for in-temp eval batches).

## Exports

### `default` — `EvalRunsView`

```ts
export default function EvalRunsView(props: Props): JSX.Element
```

Renders the header (counters + stop-all button), the runs sidebar grouped by model and eval, and the detail pane for the selected run. Props include `scope`, optional `projectId` / `pluginName` / `marketplaceName`, `skillName`, `initialRunIds`, the `iteration` number for feedback persistence, and `onClose`.
