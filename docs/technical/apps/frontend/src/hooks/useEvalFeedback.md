# useEvalFeedback.ts

**Path:** `apps/frontend/src/hooks/useEvalFeedback.ts`

Loads and persists the per-eval-name feedback map for one iteration of a skill's eval suite. Wraps the `eval:getFeedback` / `eval:saveFeedback` IPC channels and updates local state optimistically before the save round-trip resolves.

## Exports

### `interface EvalFeedbackTarget`

Identity of a specific eval iteration.

```ts
export interface EvalFeedbackTarget {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  iteration: number;
}
```

### `interface UseEvalFeedbackResult`

Return shape — `feedback` is keyed by `evalName`; `save` performs an optimistic update + `eval:saveFeedback`.

```ts
export interface UseEvalFeedbackResult {
  feedback: Record<string, string>;
  save(evalName: string, text: string): Promise<void>;
}
```

### `function useEvalFeedback`

Re-fetches when any identity field changes; saves are scoped to the same target.

```ts
export function useEvalFeedback(target: EvalFeedbackTarget): UseEvalFeedbackResult
```
