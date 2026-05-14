# baseline-store.ts

**Path:** `apps/nakiros/src/services/baseline-store.ts`

Persistent store for per-model, per-eval baseline records. Each baseline lives under
`~/.nakiros/baselines/<skill>/<eval>/<modelFullId>/<fingerprint>/baseline.json` alongside
the run artefacts (run.json, grading.json, timing.json, outputs/). Atomic writes via
write-to-tmp + rename. Version-guarded: records with a mismatched `BASELINE_VERSION` are
ignored and recomputed on next eval run.

## Exports

### `BaselineRecord`

```ts
export interface BaselineRecord
```

On-disk shape of `baseline.json`. Includes `version`, `skillName`, `evalName`,
`modelFullId`, `evalFingerprint`, aggregated `stats`, and `computedAt` epoch ms.

### `BaselineKey`

```ts
export interface BaselineKey
```

Composite primary key: `{ skillName, evalName, modelFullId, evalFingerprint }`.

### `BaselineRecordWithStatus`

```ts
export interface BaselineRecordWithStatus extends BaselineRecord
```

`BaselineRecord` enriched with `isObsolete` (model no longer current) and `artifactsPath`
(absolute path to the baseline directory). Used by the UI tooltip and the obsolescence toast.

### `getBaseline`

```ts
export function getBaseline(key: BaselineKey): BaselineRecordWithStatus | null
```

Read a single baseline by composite key. Returns `null` on any miss (absent, parse failure,
version mismatch, key mismatch). Does NOT recompute.

### `upsertBaseline`

```ts
export function upsertBaseline(key: BaselineKey, stats: EvalConfigStats, computedAt?: number): BaselineRecordWithStatus
```

Persist a baseline. Atomic write via rename. Caller is responsible for co-locating run
artefacts in the same directory.

### `listBaselines`

```ts
export function listBaselines(skillName: string): BaselineRecordWithStatus[]
```

Walk `~/.nakiros/baselines/<skill>/...` and return all baselines for a skill. Returns `[]`
when no baselines exist yet.

### `deleteBaseline`

```ts
export function deleteBaseline(key: BaselineKey): boolean
```

Remove a baseline directory (metadata + artefacts). Returns `true` when something was
deleted. Prunes empty parent dirs after deletion. Used by `eval:refreshBaseline` and the
cleanup script.
