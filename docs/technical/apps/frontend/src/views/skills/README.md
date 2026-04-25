# skills/

**Path:** `apps/frontend/src/views/skills/`

Shared building blocks for every scoped skills view (`SkillsView`, `NakirosSkillsView`, `GlobalSkillsView`, `PluginSkillsView`). Each scope plugs in its own `SkillsViewConfig` consumed by `useSkillsViewState`.

## Files

- [EvalsPanel.tsx](./EvalsPanel.md) — Shared evals tab body for every scoped skill view.
- [components.tsx](./components.md) — UI primitives shared across scoped skills views (pass-rate badge, neutral pill, segmented tab button, recursive file tree).
- [types.ts](./types.md) — Type contracts shared by every scoped skills view.
- [useSkillsViewState.ts](./useSkillsViewState.md) — Owns every piece of state and every handler shared by all scoped skill views.
