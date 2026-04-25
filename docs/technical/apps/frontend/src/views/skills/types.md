# types.ts

**Path:** `apps/frontend/src/views/skills/types.ts`

Type contracts shared by every scoped skills view (`project`,
`claude-global`, `nakiros-bundled`, `plugin`).

## Exports

### `SkillIdentity`

```ts
type SkillIdentity =
  | { scope: 'project'; projectId: string; skillName: string }
  | { scope: 'claude-global'; skillName: string }
  | { scope: 'nakiros-bundled'; skillName: string }
  | { scope: 'plugin'; marketplaceName: string; pluginName: string; skillName: string };
```

Minimal skill address shared across every IPC (list/read/save +
start eval/audit/fix). Mirrors the shape expected by
`StartEvalRunRequest`, `StartAuditRequest`, `StartFixRequest`.

### `RunScopeRef`

```ts
interface RunScopeRef {
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
}
```

Run records returned by `listEvalRuns` / `listActiveAuditRuns` /
`listActiveFixRuns`. Only the fields used for scope filtering and key
derivation.

### `SkillsViewConfig`

```ts
interface SkillsViewConfig {
  scope: SkillScope;
  keyOf(skill: Pick<Skill, 'name' | 'marketplaceName' | 'pluginName'>): string;
  keyOfRun(run: RunScopeRef): string;
  identityOf(skill: Skill): SkillIdentity;
  matchesScope(run: RunScopeRef): boolean;
  listSkills(): Promise<Skill[]>;
  readFile(skill: Skill, relativePath: string): Promise<string | null>;
  saveFile(skill: Skill, relativePath: string, content: string): Promise<void>;
  pollActiveCreate?(): Promise<AuditRun | null>;
}
```

Contract that every scope-specific view injects into the shared hook /
base view. `keyOf` must agree with `keyOfRun` for state maps to align.
