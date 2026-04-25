# audit-runner.ts

**Path:** `apps/nakiros/src/services/audit-runner.ts`

Static-review run-kind driven by `/nakiros-skill-factory audit <skillName>`. The audit produces `audit-report.md` in the run's `outputs/` directory, which is then archived into `{skillDir}/audits/audit-<timestamp>.md`.

Workdir lives under `~/.nakiros/runs/audit/<runId>/` and persists across daemon restarts. The target skill is symlinked into `{workdir}/.claude/skills/<skillName>` so the factory skill can find it via cwd. Boot recovery (`restoreOrCleanupAuditWorkdirs`) rehydrates in-flight runs into `waiting_for_input` (they resume via `--resume`) or cleans up terminal workdirs.

## Exports

### `function restoreOrCleanupAuditWorkdirs`

Boot-time scan of `~/.nakiros/runs/audit/*`. Per persisted workdir: terminal runs are deleted; completed runs stay available for Terminer; in-flight runs collapse to `waiting_for_input` (child is gone, session resumes via `--resume`).

```ts
export function restoreOrCleanupAuditWorkdirs(): void
```

### `function listActiveAuditRuns`

Return every in-memory audit run that's still in a non-terminal status (`starting` / `running` / `waiting_for_input`). Used by the UI to surface "audit running" badges.

```ts
export function listActiveAuditRuns(): AuditRun[]
```

### `function startAudit`

Start (or resume) an audit run for `request.skillName`. Idempotent on `(scope, projectId, skillName)` — an existing non-terminal run rebinds its event log to the new caller instead of spawning a fresh one.

```ts
export function startAudit(request: StartAuditRequest, opts: RunOpts): AuditRun
```

### `function sendAuditUserMessage`

Forward a user message to an audit run in `waiting_for_input`. Re-points the event log, executes one claude turn via `--resume`, then checks whether the audit report was produced.

```ts
export async function sendAuditUserMessage(runId: string, message: string, opts: RunOpts): Promise<void>
```

**Throws:** `Error` — when the run is unknown or not waiting for input.

### `function stopAudit`

Cancel an in-flight audit run: `SIGTERM` the child, collapse status to `stopped`, emit final events, tear down workdir + event log. The entry stays in the registry so the UI can keep rendering the stopped run until the user navigates away.

```ts
export function stopAudit(runId: string): void
```

### `function finishAudit`

User-acknowledged completion ("Terminer" button). The archived `audit-<ts>.md` in `{skillDir}/audits/` is kept; the workdir (conversation + events) is deleted.

```ts
export function finishAudit(runId: string): void
```

### `function getAuditRun`

Look up an audit run by id. Returns `null` when unknown.

```ts
export function getAuditRun(runId: string): AuditRun | null
```

### `function getAuditBufferedEvents`

Return the buffered stream events for the current turn. Used by the frontend on remount mid-run so the live activity panel re-populates instead of appearing empty.

```ts
export function getAuditBufferedEvents(runId: string): AuditRunEvent['event'][]
```

### `function listAuditHistory`

List archived audit reports for a given skill, newest first. Parses the ISO timestamp from the filename; falls back to the file's mtime.

```ts
export function listAuditHistory(skillDir: string): AuditHistoryEntry[]
```

### `function readAuditReport`

Read the content of an archived audit report. Returns `null` on miss or read error.

```ts
export function readAuditReport(path: string): string | null
```
