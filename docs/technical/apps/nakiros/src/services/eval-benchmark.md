# eval-benchmark.ts

**Path:** `apps/nakiros/src/services/eval-benchmark.ts`

Compute + read the `benchmark.json` file written per iteration at `{skillDir}/evals/workspace/iteration-N/benchmark.json`. The file aggregates per-eval `grading.json` + `timing.json` into a flat summary that the Evolution matrix, the fix-benchmark view, and the comparison runner all consume.

Each benchmark also captures the skill's fingerprint at the time of the run — the matrix uses this to tell apart a real regression (hash changed) from LLM-judge variance (hash identical, judge graded differently).

## Exports

### `interface EvalConfigStats`

Flat per-eval + per-config stats used inside `benchmark.json` (snake_case matches the on-disk shape).

```ts
export interface EvalConfigStats {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
  tokens: number;
  duration_ms: number;
}
```

### `function collectConfigStats`

Read `grading.json` + `timing.json` for a single eval/config cell and flatten into the stats shape. Shared with the comparison runner.

```ts
export function collectConfigStats(
  evalDir: string,
  config: 'with_skill' | 'without_skill',
): EvalConfigStats | undefined
```

### `function writeIterationBenchmark`

Compute `benchmark.json` for a completed iteration by scanning each `eval-XXX` subdirectory. Writes the file at `{skillDir}/evals/workspace/iteration-N/benchmark.json`. Captures the skill fingerprint and the Claude model id used for the iteration (from the first `with_skill` run's `timing.json`).

```ts
export function writeIterationBenchmark(skillDir: string, skillName: string, iteration: number): void
```

### `function readLatestIterationBenchmark`

Read the highest-numbered iteration's `benchmark.json` from a skill dir. Returns `null` if no iterations or no benchmark file exists. Used by the fix-benchmark comparison UI (`fix:getBenchmarks`).

```ts
export function readLatestIterationBenchmark(skillDir: string): FixBenchmarkSnapshot | null
```
