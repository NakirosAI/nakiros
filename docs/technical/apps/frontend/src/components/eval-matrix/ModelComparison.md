# ModelComparison.tsx

**Path:** `apps/frontend/src/components/eval-matrix/ModelComparison.tsx`

The Models tab — A/B/C comparison of the same eval suite across multiple Claude model ids on a frozen skill iteration. Three modes:
- **idle**: launch panel only (pick models + Run)
- **running**: live grid of in-flight runs (subscribed to `eval:event`)
- **viewing**: history selector + comparison matrix (with optional baseline)

Reuses prior runs that share a skill fingerprint to save tokens — the `Reuse` badge on a model checkbox tells the user it's free.

## Exports

### `ModelComparison`

```ts
export function ModelComparison(props: { request; refreshKey?; onRunsLaunched? }): JSX.Element
```

State owners:
- `summaries` / `selectedId` / `matrix` — historical comparisons + currently inspected one
- `fingerprintStatus` — whether the last iteration can be reused
- `selectedModels` — checkbox state for the launch panel
- `trackedRunIds` / `pendingRunIds` / `trackedRuns` — live progress, driven by `eval:event` and a polling `listEvalRuns` interval (interval cleared as soon as the batch is done)

```ts
interface Props {
  /** Identifies the skill + scope to load comparisons for. */
  request: ListComparisonsRequest;
  /** Bump to force a refetch of the comparisons list + fingerprint status. */
  refreshKey?: number;
  /**
   * Called with the fresh runIds the moment a comparison is launched. Wired
   * at the skill-view level so the shell can swap in `EvalRunsView` — the
   * view that actually handles interactive evals (chat, send, finish), which
   * the local run grid here does not. Skipped when every selected model was
   * reused (runIds: []).
   */
  onRunsLaunched?(runIds: string[]): void;
}
```
