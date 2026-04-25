# claude-global-skills-reader.ts

**Path:** `apps/nakiros/src/services/claude-global-skills-reader.ts`

CRUD on user-global skills under `~/.claude/skills/`, excluding Nakiros-managed symlinks (those already appear under "Nakiros Skills"). Other symlinks — user-installed, pointing elsewhere — are legitimate global skills and kept in the list. Backs the `claudeGlobal:*` IPC channels.

## Exports

### `function getClaudeGlobalSkillsDir`

Resolve the user-global Claude skills directory: `~/.claude/skills/`.

```ts
export function getClaudeGlobalSkillsDir(): string
```

### `function listClaudeGlobalSkills`

List user-global skills in `~/.claude/skills/`. EXCLUDES symlinks pointing into `~/.nakiros/skills/` — those are Nakiros-managed bundled skills shown in the "Nakiros Skills" tab instead.

```ts
export function listClaudeGlobalSkills(): Skill[]
```

### `function readClaudeGlobalSkill`

Read one user-global skill by name. Nakiros-managed symlinks return `null` so they don't show up in the "Claude Global" list.

```ts
export function readClaudeGlobalSkill(skillName: string): Skill | null
```

### `function readClaudeGlobalSkillFile`

Read an arbitrary file inside a user-global skill. Refuses path-traversal; returns `null` on miss.

```ts
export function readClaudeGlobalSkillFile(skillName: string, relativePath: string): string | null
```

### `function saveClaudeGlobalSkillFile`

Write an arbitrary file inside a user-global skill. Refuses path-traversal silently.

```ts
export function saveClaudeGlobalSkillFile(skillName: string, relativePath: string, content: string): void
```
