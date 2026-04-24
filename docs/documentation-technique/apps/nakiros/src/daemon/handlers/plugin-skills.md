# plugin-skills.ts

**Path:** `apps/nakiros/src/daemon/handlers/plugin-skills.ts`

Registers the `pluginSkills:*` IPC channels — CRUD on plugin-provided skills under `~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin>/skills/` (plus project-local plugins).

## IPC channels

- `pluginSkills:list` — lists every plugin skill across every discovered marketplace
- `pluginSkills:getSkill` — reads one skill's SKILL.md + tree (by `marketplaceName`, `pluginName`, `skillName`)
- `pluginSkills:readSkillFile` — reads a relative file inside a plugin skill
- `pluginSkills:saveSkillFile` — overwrites a file inside a plugin skill

## Exports

### `const pluginSkillsHandlers`

```ts
export const pluginSkillsHandlers: HandlerRegistry
```
