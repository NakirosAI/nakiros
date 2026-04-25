# fix-runner.ts

**Path:** `apps/nakiros/src/services/fix-runner.ts`

Skill iteration runner — backs BOTH `fix:*` (edit existing skill) and `create:*` (new skill from scratch). The agent always operates inside a temp workdir under `~/.nakiros/tmp-skills/<runId>/`; sync-back to the real skill only happens on {@link finishFix}. **The tmp_skill pattern is load-bearing** — it isolates in-progress edits from the real skill so evals can run against the candidate BEFORE it ships.

Workdir layout differs per mode:
- `fix` — seeded with a lean copy of the existing skill (source + latest audit + latest iteration). Skips older audits/iterations to keep the agent's context tight.
- `create` — empty. Agent writes SKILL.md + friends from scratch.

Boot recovery rehydrates in-flight workdirs into `waiting_for_input` and restores the event log from `events.jsonl` so the user sees the tail of the interrupted turn on reopen.

## Exports

### `type SkillAgentMode`

Two flavors of skill-factory-driven runs: `fix` (edit existing) vs `create` (from scratch). They share runtime machinery (runner-core) and differ only in workdir seeding, first-turn prompt, and sync-back policy.

```ts
export type SkillAgentMode = 'fix' | 'create';
```

### `function restoreOrCleanupTempWorkdirs`

Boot-time scan of `~/.nakiros/tmp-skills/`. Rehydrates non-terminal runs into `waiting_for_input` (the subprocess is gone but the `sessionId` is preserved so `--resume` works on the next turn). Discards terminal workdirs.

```ts
export function restoreOrCleanupTempWorkdirs(): void
```

### `const cleanupOrphanTempWorkdirs`

Back-compat alias — old name from before restore semantics. Equal to `restoreOrCleanupTempWorkdirs`.

### `function startFix`

Start (or resume) a fix run on an existing skill. Seeds the temp workdir with a lean copy. Sync-back on `finishFix`.

```ts
export function startFix(request: StartAuditRequest, opts: RunOpts): AuditRun
```

### `function startCreate`

Start (or resume) a create run for a new skill. Empty temp workdir. Sync-back only fires if the target skill still doesn't exist.

```ts
export function startCreate(request: StartAuditRequest, opts: RunOpts): AuditRun
```

### `function sendFixUserMessage`

Forward a user message to a fix/create run in `waiting_for_input`. Fix runs never auto-complete — every turn transitions back to `waiting_for_input`.

```ts
export async function sendFixUserMessage(runId: string, message: string, opts: RunOpts): Promise<void>
```

**Throws:** `Error` — when the run is unknown or not waiting for input.

### `function finishFix`

User-confirmed completion. Syncs the temp workdir back to the real skill (replace for `fix`, create for `create`), tears down the workdir, marks the run completed. Safety net for `create` mode: refuses to sync if the target skill appeared since start.

```ts
export function finishFix(runId: string, opts: RunOpts): void
```

### `const finishCreate`, `stopCreate`, `sendCreateUserMessage`, `getCreateRun`, `getCreateTempWorkdir`, `getCreateRealSkillDir`, `getCreateBufferedEvents`

Create-run aliases of the fix-run counterparts — both modes share the registry + lifecycle machinery, so these are `export const x = y`.

### `function stopFix`

Cancel an in-flight fix/create run. Stopped runs do NOT sync back — temp modifications are discarded.

```ts
export function stopFix(runId: string): void
```

### `function getFixRun`, `getFixTempWorkdir`, `getFixRealSkillDir`

Registry accessors. `getFixTempWorkdir` is used by the eval runner so `fix:runEvalsInTemp` can evaluate the in-progress copy; `getFixRealSkillDir` lets the benchmarks compare against the real skill's latest iteration.

### `function getFixBufferedEvents`

Return the buffered stream events for the current turn (used on remount mid-run).

### `function listActiveFixRuns`, `listActiveCreateRuns`

List every non-terminal run of each mode. Used by the UI to surface "fix running" / "create running" badges.

### `function listFixDiff`

List every file that exists in the original skill or in the temp workdir, with `inOriginal` / `inModified` flags so the diff viewer can render created / deleted / modified states distinctly.

```ts
export function listFixDiff(runId: string): SkillDiffEntry[]
```

### `function readFixDiffFile`

Read one file from BOTH sides of the diff (original + temp workdir), returning contents side-by-side with a binary flag for the UI.

```ts
export function readFixDiffFile(runId: string, relativePath: string): SkillDiffFilePayload
```
