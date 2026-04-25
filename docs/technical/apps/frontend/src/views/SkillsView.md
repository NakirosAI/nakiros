# SkillsView.tsx

**Path:** `apps/frontend/src/views/SkillsView.tsx`

Dashboard "Skills" tab for project-scoped skills (`.claude/skills/` inside the project root). Lists detected skills, lets the user inspect/edit files, run audits, evals and fixes, plus create a brand-new skill via the `mode='create'` path of `FixView`. Wires `useSkillsViewState` to the project IPC surface (`listProjectSkills`, `readSkillFile`, `saveSkillFile`, `listActiveCreateRuns`) and routes audit / eval / fix actions to overlay views. Owns the "new skill" name modal and dispatches `startCreate` when the user submits. Mounted by `DashboardRouter`.

## Exports

### `default` — `SkillsView`

```ts
export default function SkillsView(props: Props): JSX.Element
```

Renders either the skills list (with "new skill" / "draft in progress" buttons), the skill detail panel (files / evals / audits tabs), the in-flight create overlay (delegating to `FixView` in `'create'` mode), or one of the audit / eval / fix overlays. Props: `{ project: Project }`.
