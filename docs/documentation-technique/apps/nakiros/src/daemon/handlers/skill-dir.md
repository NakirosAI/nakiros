# skill-dir.ts

**Path:** `apps/nakiros/src/daemon/handlers/skill-dir.ts`

Central resolver turning a `StartEvalRunRequest` (scope + optional projectId / pluginName / marketplaceName / skillName, plus the optional `skillDirOverride`) into an absolute skill directory path. Reused by every run-kind handler (eval / audit / fix / create / comparison) so scope resolution logic lives in one place — this mirrors `resolveSkillDir` on the read side (cf. `SkillScope` docs).

## Exports

### `function resolveEvalSkillDir`

Resolve the directory of the skill targeted by a request. Also accepts partial request shapes (same scope + projectId + skillName fields) used by audit/fix/create/feedback/output handlers.

`skillDirOverride` takes precedence — used by fix runs so that evals can run against the temp copy of the in-progress skill.

```ts
export function resolveEvalSkillDir(request: StartEvalRunRequest): string
```

**Returns:** absolute path to the resolved skill directory.

**Throws:** `Error` — when a required scope parameter is missing (e.g. `projectId` for `project`, `marketplaceName` / `pluginName` for `plugin`) or when the project is unknown.
