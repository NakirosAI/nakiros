# claude-global.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-global.ts`

Registers the `claudeGlobal:*` IPC channels — CRUD on user-global skills under `~/.claude/skills/`, excluding Nakiros symlinks.

## IPC channels

- `claudeGlobal:listSkills` — returns every non-Nakiros skill under `~/.claude/skills`
- `claudeGlobal:getSkill` — reads one skill's SKILL.md + tree
- `claudeGlobal:readSkillFile` — reads a relative file inside a skill
- `claudeGlobal:saveSkillFile` — overwrites a file inside a skill

## Exports

### `const claudeGlobalHandlers`

```ts
export const claudeGlobalHandlers: HandlerRegistry
```
