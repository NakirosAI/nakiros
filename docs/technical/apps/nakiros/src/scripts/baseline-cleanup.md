# baseline-cleanup.ts

**Path:** `apps/nakiros/src/scripts/baseline-cleanup.ts`

CLI maintenance script invoked by `nakiros baseline:cleanup`. Scans `~/.nakiros/skills/` and the bundled-skills directory for legacy `without_skill/` run directories that became redundant once the per-model baseline cache (`~/.nakiros/baselines/`) was introduced in v0.7. Reports disk usage and, when `--apply` is passed, removes them.

## Exports

### `runBaselineCleanup`

```ts
export async function runBaselineCleanup(args: string[]): Promise<number>
```

Entry point invoked by `nakiros baseline:cleanup`. Prints a report of every legacy `without_skill` directory found under the default scan roots and, when `--apply` is passed, removes them. Drill-down on those iterations' baselines is lost in exchange — but the canonical baseline data already lives in `~/.nakiros/baselines/` since the per-model cache.

**Parameters:**
- `args` — CLI argument array; recognizes `--apply` (execute deletions) and `--help` / `-h` (print usage)

**Returns:** exit code — `0` for success (dry-run, apply succeeded, or nothing to do), `1` when deletions partially failed
