# comparison-runner.ts

**Path:** `apps/nakiros/src/services/comparison-runner.ts`

Orchestrates N models × M evals into a dedicated storage folder isolated from the Evolution iteration history. Reuses `eval-runner` for the actual runs but routes artefacts to `{skillDir}/evals/comparisons/<comparisonId>/<model>/…` instead of the workspace. Writes a `comparison.json` aggregate once all fresh runs complete.

**Reuse optimisation:** when the skill fingerprint is unchanged since the last Evolution iteration AND that iteration used one of the requested models, the comparison physically copies that iteration's artefacts into the comparison dir rather than re-running the same skill on the same model (saves real tokens, especially on Opus). If the fingerprint has changed, the last-iteration's model is re-run too — otherwise a stale Opus would be compared against fresh Haiku/Sonnet.

## Exports

### `interface StartComparisonOptions`

Options passed by the `comparison:run` handler to `startComparisonRun`.

```ts
export interface StartComparisonOptions {
  resolveSkillDir(request: RunComparisonRequest): string;
  onEvent(event: EvalRunEvent): void;
}
```

### `function getComparisonFingerprintStatus`

Pre-flight check for the comparison UI. Returns the current fingerprint, the last iteration's info, and whether the two match.

```ts
export function getComparisonFingerprintStatus(skillDir: string): ComparisonFingerprintStatus
```

### `function startComparisonRun`

Kick off a comparison run. Returns immediately with the `comparisonId`, the list of fresh `runIds`, and a `reuseSummary` telling the UI which models came from a prior iteration. Comparison events are broadcast on `eval:event` — comparison runs piggyback on the eval runner.

```ts
export async function startComparisonRun(
  request: RunComparisonRequest,
  options: StartComparisonOptions,
): Promise<RunComparisonResponse>
```

**Throws:** `Error` — when the skill directory is missing or no models are selected.

### `function listComparisons`

List every previously-run comparison for a skill, newest-first. Aggregates per-model pass rates for the list view tile.

```ts
export function listComparisons(skillDir: string): ComparisonSummary[]
```

### `function loadComparisonMatrix`

Load the full per-model × per-eval matrix for one comparison. Each cell carries `reusedFromIteration` so the UI can render a hint on columns that were copied instead of freshly run.

```ts
export function loadComparisonMatrix(skillDir: string, comparisonId: string): ComparisonMatrix | null
```
