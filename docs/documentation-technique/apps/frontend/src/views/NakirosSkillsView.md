# NakirosSkillsView.tsx

**Path:** `apps/frontend/src/views/NakirosSkillsView.tsx`

Full-screen view for skills shipped bundled with the Nakiros package itself (the `nakiros-bundled` scope). Browse, inspect, edit, audit, eval and fix the skills delivered as part of `@nakirosai/nakiros` and synced into `~/.claude/skills/`. Wires `useSkillsViewState` to the `nakiros-bundled` IPC surface (`listBundledSkills`, `readBundledSkillFile`, `saveBundledSkillFile`) and delegates run overlays to `AuditView` / `EvalRunsView` / `FixView`. Reached from the `Home` "Nakiros skills" button.

## Exports

### `default` — `NakirosSkillsView`

```ts
export default function NakirosSkillsView(props: Props): JSX.Element
```

Renders either the skills list, the skill detail panel (files / evals / audits tabs), or one of the run overlays. Props: `{ onBack: () => void }`.
