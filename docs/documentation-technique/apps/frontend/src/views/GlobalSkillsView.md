# GlobalSkillsView.tsx

**Path:** `apps/frontend/src/views/GlobalSkillsView.tsx`

Full-screen view for skills installed under `~/.claude/skills/` (the "Claude global" scope). Lists every detected skill, lets the user inspect files, edit them, run evals, audit, and fix. Wires `useSkillsViewState` to the `claude-global` IPC surface (`listClaudeGlobalSkills`, `readClaudeGlobalSkillFile`, `saveClaudeGlobalSkillFile`) and routes audit/eval/fix actions to `AuditView` / `EvalRunsView` / `FixView` overlays. Mounted from `App.tsx` via the "Globals" tab on `Home`.

## Exports

### `default` — `GlobalSkillsView`

```ts
export default function GlobalSkillsView(props: Props): JSX.Element
```

Renders either the skills list, the skill detail panel (files / evals / audits tabs), or one of the run overlays. Props: `{ onBack: () => void }`.
