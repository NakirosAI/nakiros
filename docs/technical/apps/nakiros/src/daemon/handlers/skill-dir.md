# skill-dir.ts

**Path:** `apps/nakiros/src/daemon/handlers/skill-dir.ts`

Central resolver turning a `SkillScopeRef` (scope + skillName + optional projectId / pluginName / marketplaceName / skillDirOverride) into an absolute skill directory path. Reused by every run-kind handler (eval / audit / fix / create / comparison) and by the cross-scope read-file handler so scope resolution logic lives in one place.

## Exports

### `interface SkillScopeRef`

Minimal scope reference accepted by `resolveSkillDir`. Every request shape involving a skill (`StartEvalRunRequest`, `StartAuditRequest`, `GetEvalMatrixRequest`, `LoadIterationRunRequest`, `RunComparisonRequest`, the cross-scope read-file request) structurally satisfies this — pass the request directly. `skillDirOverride` short-circuits resolution and is used by fix runs so evals can target the temp copy of the in-progress skill.

```ts
export interface SkillScopeRef {
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillDirOverride?: string;
}
```

### `function resolveSkillDir`

Resolve the absolute directory of the skill targeted by `ref`. Accepts the four scopes (`project`, `nakiros-bundled`, `claude-global`, `plugin`) and the `skillDirOverride` short-circuit.

```ts
export function resolveSkillDir(ref: SkillScopeRef): string
```

**Returns:** absolute path to the resolved skill directory.

**Throws:** `Error` — when a required scope parameter is missing (e.g. `projectId` for `project`, `marketplaceName` / `pluginName` for `plugin`) or when the project is unknown.
