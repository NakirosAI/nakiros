# index.ts

**Path:** `apps/nakiros/src/services/runner-core/index.ts`

Barrel entry point for `runner-core`. Re-exports every helper, class, type that the domain runners (eval / audit / fix / create / comparison) compose to run a single claude turn against a sandboxed skill copy.

## Re-exports

- `generateRunId` — see [run-id.md](./run-id.md)
- `formatTool` — see [tool-format.md](./tool-format.md)
- `buildClaudeArgs`, `handleClaudeStreamEvent`, `spawnClaudeTurn`, `BuildArgsOptions`, `ClaudeStreamHandlers`, `SpawnTurnOptions`, `SpawnTurnResult` — see [claude-stream.md](./claude-stream.md)
- `EventLog`, `EventLogOptions` — see [event-log.md](./event-log.md)
- `persistRunJson`, `loadRunJson` — see [run-store.md](./run-store.md)
- `cleanupRunWorkdir`, `deleteClaudeProjectEntry`, `sweepOrphanNakirosProjectEntries`, `encodeProjectPath`, `SweepResult` — see [claude-projects.md](./claude-projects.md)
- `findGitRoot`, `createEvalSandbox`, `captureSandboxDiff`, `listSandboxUntracked`, `destroyEvalSandbox`, `sweepOrphanSandboxes`, `sandboxRoot`, `CreateSandboxResult` — see [git-worktree.md](./git-worktree.md)
- `createTmpSandbox`, `destroyTmpSandbox`, `CreateTmpSandboxArgs`, `CreateTmpSandboxResult` — see [tmp-sandbox.md](./tmp-sandbox.md)
- `createIsolatedHome`, `destroyIsolatedHome`, `IsolatedHome` — see [isolated-home.md](./isolated-home.md)
- `isActiveRunStatus` — see [run-status.md](./run-status.md)
- `writeExecutionSettings`, `ExecutionSettingsOptions` — see [execution-settings.md](./execution-settings.md)
