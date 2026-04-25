# EvalsPanel.tsx

**Path:** `apps/frontend/src/views/skills/EvalsPanel.tsx`

Shared evals tab body for every scoped skill view (project, nakiros,
claude-global, plugin). Lists eval definitions plus the
evolution/comparison matrix; reads from the `skill-evals` i18n namespace
so callers don't need to thread `t` through.

## Exports

### `SkillEvalsPanel`

```ts
function SkillEvalsPanel(props: {
  skill: Skill;
  scope: SkillScope;
  projectId?: string;
  marketplaceName?: string;
  pluginName?: string;
  onComparisonLaunched?(runIds: string[]): void;
}): JSX.Element;
```

Renders the eval definitions list and toggles between `EvalMatrix`
(historical evolution) and `ModelComparison` (A/B/C across models).
`onComparisonLaunched` is forwarded to `ModelComparison` so the shell can
open the freshly launched eval runs view.
