# bundled-skills-reader.ts

**Path:** `apps/nakiros/src/services/bundled-skills-reader.ts`

CRUD on Nakiros bundled skills stored under `~/.nakiros/skills/` (after the initial sync from the app ROM). Hides the `evals/workspace/` subtree from the skill file tree surfaced to the UI. Backs the `nakiros:*` bundled-skill IPC channels.

## Exports

### `function listBundledSkills`

List all Nakiros bundled skills — returns full `Skill` records (content + file tree + eval suite + audit count).

```ts
export function listBundledSkills(): Skill[]
```

### `function readBundledSkill`

Read a single bundled skill by name. Returns `null` when the directory doesn't exist.

```ts
export function readBundledSkill(skillName: string): Skill | null
```

### `function readBundledSkillFile`

Read an arbitrary file within a bundled skill by relative path. Refuses paths that escape the skill directory. Returns `null` on missing or unreadable files.

```ts
export function readBundledSkillFile(skillName: string, relativePath: string): string | null
```

### `function saveBundledSkillFile`

Write a file within a bundled skill (used when Nakiros auto-improves its own skills). Refuses paths that escape the skill directory.

```ts
export function saveBundledSkillFile(skillName: string, relativePath: string, content: string): void
```
