# eval-comparison.ts

**Path:** `packages/shared/src/types/eval-comparison.ts`

Types for the Eval Model Comparison feature — an A/B/C view across Haiku / Sonnet / Opus for a single skill snapshot, so the user can decide "Sonnet is enough, I can drop Opus here". Stored under `{skillDir}/evals/comparisons/<timestamp>/` to avoid polluting the Evolution matrix.

Reuse strategy: when the skill fingerprint has not changed since the last Evolution iteration AND that iteration used one of the requested models, the comparison runner copies the iteration's artefacts instead of re-running them.

## Exports

### `interface RunComparisonRequest`

Request to launch a new comparison.

```ts
export interface RunComparisonRequest {
  scope: SkillScope;
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  /** Claude model aliases to compare (e.g. `['haiku', 'sonnet', 'opus']`). */
  models: string[];
  skillDirOverride?: string;
  /** Max number of claude subprocesses across all models. Defaults to 4. */
  maxConcurrent?: number;
}
```

### `interface RunComparisonResponse`

Response returned by the comparison runner when a new comparison is launched.

```ts
export interface RunComparisonResponse {
  comparisonId: string;
  runIds: string[];
  reuseSummary: ComparisonReuseSummary;
}
```

### `interface ComparisonReuseSummary`

Summary of which models the comparison reused from prior Evolution iterations.

```ts
export interface ComparisonReuseSummary {
  /** Model alias → `iteration` we copied from (null when launched fresh). */
  reusedFromIteration: Record<string, number | null>;
}
```

### `interface ComparisonFingerprintStatus`

Pre-flight info so the UI can warn the user BEFORE launching: "the skill has changed since iter 4, so Opus will be re-run alongside Haiku and Sonnet".

```ts
export interface ComparisonFingerprintStatus {
  currentFingerprint: string | null;
  lastIteration: { iteration: number; model: string | null; fingerprint: string | null } | null;
  /** False → the comparison must re-run the last iteration's model too. */
  canReuseLastIteration: boolean;
}
```

### `interface ComparisonCell`

Single cell in the comparison matrix — one eval at one model. `reusedFromIteration` is set when the cell was copied from an Evolution iteration (fingerprint match) rather than freshly run.

### `interface ComparisonRow`

One row of the comparison matrix — all per-model cells for a single eval, aligned to `ComparisonMatrix.models`.

### `interface ComparisonMatrix`

Aggregated comparison matrix consumed by the A/B/C view in the UI. Holds the models column order, the per-eval rows, and per-model aggregates for the summary row.

### `interface ComparisonSummary`

Compact summary of a comparison, used by the list view tile.

### `interface GetComparisonMatrixRequest`

Request payload for the `comparison:getMatrix` IPC channel.

### `interface ListComparisonsRequest`

Request payload for the `comparison:list` IPC channel.

### `interface GetComparisonFingerprintStatusRequest`

Request payload for the `comparison:getFingerprintStatus` IPC channel.
