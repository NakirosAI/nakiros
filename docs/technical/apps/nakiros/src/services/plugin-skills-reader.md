# plugin-skills-reader.ts

**Path:** `apps/nakiros/src/services/plugin-skills-reader.ts`

CRUD on plugin-provided skills living at `~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin>/skills/<skill>/`. Backs the `pluginSkills:*` IPC channels. Tolerates plugins without a `skills/` subdirectory (some plugins only ship agents/commands).

## Exports

### `interface PluginSkillLocation`

Fully-qualified location of a plugin skill: marketplace / plugin / skill / absolute dir.

```ts
export interface PluginSkillLocation {
  marketplaceName: string;
  pluginName: string;
  skillName: string;
  skillDir: string;
}
```

### `function listPluginSkillLocations`

Walk `~/.claude/plugins/marketplaces/…` and return every plugin skill found. Missing `skills/` directories are skipped silently.

```ts
export function listPluginSkillLocations(): PluginSkillLocation[]
```

### `function resolvePluginSkillDir`

Build the absolute path to a plugin skill given `(marketplace, plugin, skill)`. Exposed so other modules (notably `handlers/skills-common.ts`) can resolve plugin skills without walking the tree.

```ts
export function resolvePluginSkillDir(marketplaceName: string, pluginName: string, skillName: string): string
```

### `function listPluginSkills`

List every plugin skill sorted by `(marketplace, plugin, skill)`.

```ts
export function listPluginSkills(): Skill[]
```

### `function readPluginSkill`

Read one plugin skill by triple identifier. Returns `null` when unknown.

```ts
export function readPluginSkill(marketplaceName: string, pluginName: string, skillName: string): Skill | null
```

### `function readPluginSkillFile`

Read an arbitrary file inside a plugin skill. Refuses path-traversal; returns `null` on miss.

```ts
export function readPluginSkillFile(marketplaceName: string, pluginName: string, skillName: string, relativePath: string): string | null
```

### `function savePluginSkillFile`

Write an arbitrary file inside a plugin skill. Refuses path-traversal silently.

```ts
export function savePluginSkillFile(marketplaceName: string, pluginName: string, skillName: string, relativePath: string, content: string): void
```
