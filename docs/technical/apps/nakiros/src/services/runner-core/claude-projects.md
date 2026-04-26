# claude-projects.ts

**Path:** `apps/nakiros/src/services/runner-core/claude-projects.ts`

Cleanup helpers for stray `~/.claude/projects/<encoded-cwd>/` entries. Every `claude` subprocess Nakiros spawns registers its cwd as a "project" where the CLI stores conversation history. Because Nakiros uses a fresh cwd per run (audit workdir, fix/create tmp-skill, eval iteration), each run would leave a stale project entry behind and bloat the user's Claude Code project list without these helpers.

The boot sweep in `server.ts` calls `sweepOrphanNakirosProjectEntries(keep)` with the encoded names of every still-registered run so the resume flow finds its session file intact. Teardown paths call `deleteClaudeProjectEntry` / `cleanupRunWorkdir` as part of normal shutdown.

## Exports

### `function encodeProjectPath`

Translate an absolute filesystem path into the directory name Claude Code uses inside `~/.claude/projects/`. Empirically: `/`, `.` AND `_` all collapse to `-` (so `/Users/foo/.nakiros/runs/audit/audit_xxx_1` becomes `-Users-foo--nakiros-runs-audit-audit-xxx-1`). Matches the encoding the `claude` CLI itself uses — without the underscore mapping the daemon's resume / cleanup helpers target the wrong directory and silently leak entries (or fail with "No conversation found with session ID …").

```ts
export function encodeProjectPath(cwd: string): string
```

### `function deleteClaudeProjectEntry`

Delete the Claude-Code project entry for a given cwd. No-ops if the entry doesn't exist. Safe to call right before (or after) removing the workdir.

```ts
export function deleteClaudeProjectEntry(cwd: string): void
```

### `function cleanupRunWorkdir`

Tear down a run's workdir: remove the directory itself AND the matching Claude-Code project entry. Both steps are best-effort. Used by audit/fix/create at end-of-run.

```ts
export function cleanupRunWorkdir(workdir: string): void
```

### `interface SweepResult`

Return value of `sweepOrphanNakirosProjectEntries` — how many entries were scanned vs deleted.

```ts
export interface SweepResult {
  scanned: number;
  deleted: number;
}
```

### `function sweepOrphanNakirosProjectEntries`

Boot-time cleanup. Deletes Claude-Code project entries that carry a Nakiros-identifying marker (`-nakiros-runs-`, `-nakiros-tmp-skills-`, `-nakiros-sandboxes-`, `-evals-workspace-iteration-`, legacy `-nakiros-audit-`, `-nakiros-fix-`) AND are NOT in the supplied `keep` set.

The `keep` set is built upstream by collecting every registered run's cwd and encoding it with `encodeProjectPath`. We don't try to decode the Claude entry name back to a filesystem path — the encoding collapses `/`, `.` and `_` to a single `-`, so the reverse is ambiguous. Going forward only by what the runner registries hold is reliable. Without the `keep` argument the sweep falls back to a permissive mode (no Nakiros entries deleted) — caller is responsible for passing the keep set if it wants orphan cleanup; passing `new Set<string>()` reclaims everything Nakiros-marked.

```ts
export function sweepOrphanNakirosProjectEntries(keep?: ReadonlySet<string>): SweepResult
```
