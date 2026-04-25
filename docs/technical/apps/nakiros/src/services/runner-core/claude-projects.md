# claude-projects.ts

**Path:** `apps/nakiros/src/services/runner-core/claude-projects.ts`

Cleanup helpers for stray `~/.claude/projects/<encoded-cwd>/` entries. Every `claude` subprocess Nakiros spawns registers its cwd as a "project" where the CLI stores conversation history. Because Nakiros uses a fresh cwd per run (audit workdir, fix/create tmp-skill, eval iteration), each run would leave a stale project entry behind and bloat the user's Claude Code project list without these helpers.

The boot sweep in `server.ts` calls `sweepOrphanNakirosProjectEntries` to reclaim stragglers from previous sessions. Teardown paths call `deleteClaudeProjectEntry` / `cleanupRunWorkdir` as part of normal shutdown.

## Exports

### `function encodeProjectPath`

Translate an absolute filesystem path into the directory name Claude Code uses inside `~/.claude/projects/`. Empirically: `/` and `.` both collapse to `-` (so `/Users/foo/.nakiros` → `-Users-foo--nakiros`).

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

Boot-time cleanup. Deletes entries that (1) decode to a path that no longer exists on disk AND (2) carry a Nakiros-identifying marker in their encoded name (`-nakiros-runs-`, `-nakiros-tmp-skills-`, `-evals-workspace-iteration-`, legacy `-nakiros-audit-`, `-nakiros-fix-`).

Live projects (path still on disk) are left alone. Entries outside Nakiros naming conventions are ignored — real user projects are never touched.

```ts
export function sweepOrphanNakirosProjectEntries(): SweepResult
```
