# build.ts

**Path:** `apps/nakiros/src/services/skill-fs/build.ts`

Assembles the canonical `Skill` record from a skill directory: reads `SKILL.md`, scans the file tree, parses the eval suite, and counts archived audits. Every skill-reader (project / bundled / claude-global / plugin) builds skills through this single function.

## Exports

### `interface BuildSkillRecordOptions`

Inputs to `buildSkillRecord`. `extras` is shallow-merged at the end and is the place to set scope-specific fields like `pluginName` / `marketplaceName`.

```ts
export interface BuildSkillRecordOptions {
  skillDir: string;
  skillName: string;
  projectId: string;
  extras?: Partial<Skill>;
}
```

### `function buildSkillRecord`

Build a `Skill` record from a skill directory on disk. Reads `SKILL.md` (best-effort — empty string if missing/unreadable), scans the directory tree, parses the eval suite, and counts archived audits. `extras` overrides any field on the resulting record.

```ts
export function buildSkillRecord(opts: BuildSkillRecordOptions): Skill
```

**Returns:** a fully-populated `Skill` ready for IPC return.
