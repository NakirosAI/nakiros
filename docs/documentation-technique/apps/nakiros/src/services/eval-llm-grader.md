# eval-llm-grader.ts

**Path:** `apps/nakiros/src/services/eval-llm-grader.ts`

LLM-based grader for `type: 'llm'` assertions. Spawns one claude subprocess that reads the agent's `outputs/` directory + final assistant text and grades every assertion in a single call, returning a JSON array aligned to the input order. Resilient to code fences and surrounding prose; fills missing entries with `passed: false` + explanation.

Grader is pinned to Sonnet — assertion grading is classification against a bounded digest (Opus brings no accuracy gain) and keeping the judge model explicit reduces same-model bias when the agent under test runs on Opus.

## Exports

### `interface LlmGradeResult`

Result for a single LLM assertion: pass/fail + short evidence quote (capped 400 chars).

```ts
export interface LlmGradeResult {
  passed: boolean;
  evidence: string;
}
```

### `const JUDGE_MODEL`

Model used for LLM-based assertion grading. Pinned to `sonnet`.

```ts
export const JUDGE_MODEL = 'sonnet';
```

### `function gradeLlmAssertionsBatch`

Grade multiple LLM assertions in a SINGLE claude subprocess spawn. Results returned in the same order as the input assertions. Truncates `outputs/` file content to `MAX_OUTPUT_FILE_BYTES` per file and `MAX_TOTAL_OUTPUTS_BYTES` across all files before including it in the judge prompt.

```ts
export async function gradeLlmAssertionsBatch(
  workdir: string,
  assertions: SkillEvalAssertionDefinition[],
  assistantText: string,
): Promise<LlmGradeResult[]>
```
