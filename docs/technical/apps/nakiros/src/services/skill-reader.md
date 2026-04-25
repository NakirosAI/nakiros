# skill-reader.ts

**Path:** `apps/nakiros/src/services/skill-reader.ts`

CRUD on project-scoped skills under `<projectPath>/.claude/skills/<skillName>/`. Backs the `project:listSkills` / `project:getSkill` / `project:saveSkill` / `project:readSkillFile` / `project:saveSkillFile` IPC channels. Hides the `evals/workspace/` subtree from the file tree.

## Exports

### `function listSkills`

List all skills in a project's `.claude/skills/` directory. Each entry carries the full `Skill` record (content + file tree + eval suite + audit count).

```ts
export function listSkills(projectPath: string, projectId: string): Skill[]
```

### `function getSkill`

Get a single skill by name. Returns `null` when the directory doesn't exist.

```ts
export function getSkill(projectPath: string, projectId: string, skillName: string): Skill | null
```

### `function saveSkill`

Save/update a skill's `SKILL.md` content.

```ts
export function saveSkill(projectPath: string, skillName: string, content: string): void
```

### `function readSkillFile`

Read any file inside a skill directory by relative path. Refuses paths that escape the skill directory. Returns `null` on missing or unreadable files.

```ts
export function readSkillFile(projectPath: string, skillName: string, relativePath: string): string | null
```

### `function saveSkillFile`

Write any file inside a skill directory by relative path. Refuses paths that escape the skill directory.

```ts
export function saveSkillFile(projectPath: string, skillName: string, relativePath: string, content: string): void
```
