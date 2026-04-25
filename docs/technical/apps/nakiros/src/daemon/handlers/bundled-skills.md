# bundled-skills.ts

**Path:** `apps/nakiros/src/daemon/handlers/bundled-skills.ts`

Registers the `nakiros:*` IPC channels for Nakiros bundled skills (the ROM) stored under `~/.nakiros/skills/`, plus conflict resolution when ROM updates clash with user edits.

## IPC channels

- `nakiros:listBundledSkills` — every bundled skill available on disk
- `nakiros:getBundledSkill` — one bundled skill's SKILL.md + tree
- `nakiros:readBundledSkillFile`, `nakiros:saveBundledSkillFile` — file-level CRUD
- `nakiros:promoteBundledSkill` — convert a user-edited bundled skill into a user-owned skill
- `nakiros:listBundledSkillConflicts` — conflicts between ROM updates and user edits
- `nakiros:resolveBundledSkillConflict` — applies one of `apply-rom` | `keep-mine` | `promote-mine`
- `nakiros:readBundledSkillConflictDiff` — per-file diff used by the conflict UI

## Exports

### `const bundledSkillsHandlers`

```ts
export const bundledSkillsHandlers: HandlerRegistry
```
