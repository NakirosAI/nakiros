# FixView.tsx

**Path:** `apps/frontend/src/views/FixView.tsx`

Full-screen overlay driving the fix-skill or create-skill agent. Both modes operate on an isolated temp workdir (the tmp_skill pattern) — the user iterates with the agent, optionally runs evals against the temp copy, then either syncs the result back to the real skill location or discards it. Resolves the matching IPC surface based on `mode` (`window.nakiros.getFixRun` / `getCreateRun`, `sendFixUserMessage` / `sendCreateUserMessage`, `finishFix` / `finishCreate`, `stopFix` / `stopCreate`, `onFixEvent` / `onCreateEvent`, etc.) and wires it into `useRunState`. Embeds `EvalMatrix` to track in-temp eval iterations, `FixReviewPanel` to review staged file changes, and launches `EvalRunsView` as a higher-z-index overlay for in-temp eval batches via `runFixEvalsInTemp`. Mounted from `*SkillsView` when fix/create is active.

## Exports

### `default` — `FixView`

```ts
export default function FixView(props: Props): JSX.Element
```

Renders the fix/create header (status pill, evals trigger, sync/discard actions), evolution matrix, conversation/review tabs, error banner, the user input panel, and the optional `EvalRunsView` overlay above. Props: `scope`, optional `projectId` / `pluginName` / `marketplaceName`, `skillName`, `initialRun`, optional `mode` (`'fix'` default or `'create'`), and `onClose`.
