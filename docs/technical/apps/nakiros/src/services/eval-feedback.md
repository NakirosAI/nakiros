# eval-feedback.ts

**Path:** `apps/nakiros/src/services/eval-feedback.ts`

Read/write per-iteration feedback at `{skillDir}/evals/workspace/iteration-N/feedback.json`. The file maps `evalName → feedback string` per the agentskills.io spec — empty string means "passed human review" and is preserved.

## Exports

### `function readIterationFeedback`

Read `feedback.json` for a skill iteration. Returns `{}` if the file is missing or unreadable.

```ts
export function readIterationFeedback(skillDir: string, iteration: number): Record<string, string>
```

### `function saveEvalFeedback`

Save (or update) the feedback for a single eval inside an iteration. Empty string is preserved on purpose (per spec, `""` = passed human review).

```ts
export function saveEvalFeedback(
  skillDir: string,
  iteration: number,
  evalName: string,
  feedback: string,
): void
```
