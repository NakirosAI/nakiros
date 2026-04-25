# PluginSkillsView.tsx

**Path:** `apps/frontend/src/views/PluginSkillsView.tsx`

Full-screen view for skills installed by Claude Code plugins, located under `~/.claude/plugins/marketplaces/<mkt>/plugins/<plugin>/skills/` (the `plugin` scope). Lists marketplaces, then per-marketplace skills, with the usual inspect / edit / audit / eval / fix workflow. Uses a composite identity `<marketplace>::<plugin>::<skill>` to disambiguate skills with the same name. Wires `useSkillsViewState` to the plugin IPC surface (`listPluginSkills`, `readPluginSkillFile`, `savePluginSkillFile`) and routes audit/eval/fix to overlay views. Reached from the `Home` "Plugins" tab.

## Exports

### `default` — `PluginSkillsView`

```ts
export default function PluginSkillsView(props: Props): JSX.Element
```

Renders either the marketplace tile grid, the per-marketplace skills grid, the skill detail panel (files / evals / audits tabs), or one of the run overlays. Props: `{ onBack: () => void }`.
