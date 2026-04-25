# eval-parser.ts

**Path:** `apps/nakiros/src/services/eval-parser.ts`

Parse a skill's eval suite from disk: static definitions (`evals/evals.json`) + historical iterations (`evals/workspace/iteration-N/`). Used by every skill reader (project / bundled / claude-global / plugin) to populate the `Skill.evals` field.

## Exports

### `function parseSkillEvals`

Build the full `SkillEvalSuite` for a skill. Walks every `iteration-*/` directory, parses `grading.json` + `timing.json` per eval + config, collects per-eval feedback from `feedback.json`, and computes per-iteration deltas vs the previous iteration.

Returns `null` when the skill has no `evals/evals.json`.

```ts
export function parseSkillEvals(skillDir: string, skillName: string): SkillEvalSuite | null
```
