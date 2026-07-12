# audit-runner.ts

**Path:** `apps/nakiros/src/services/audit-runner.ts`

Static-review run-kind driven by `/nakiros-skill-factory audit <skillName>`. The audit produces `audit-report.md` in the run's `outputs/` directory, which is then archived into `{skillDir}/audits/audit-<timestamp>.md`.

Workdir lives under `~/.nakiros/runs/audit/<runId>/` and persists across daemon restarts. The target skill is symlinked into `{workdir}/.claude/skills/<skillName>` so the factory skill can find it via cwd. Boot recovery (`restoreOrCleanupAuditWorkdirs`) rehydrates in-flight runs into `waiting_for_input` + `interruptedByReboot=true` (the user gets a "Reprendre" button) when the Claude session file at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` still exists, or collapses them to `stopped` when the session file is gone (without that defensive check the user's `--resume` would hit "No conversation found with session ID …"). Terminal runs are returned read-only, terminal workdirs are deleted on boot.

Built on top of the shared [`createRunner`](../services/runner-core/runner.md) factory — this file only contributes the audit-specific spec (workdir prep with skill symlink, post-turn artefact archive, audit-history listing) and re-exports the public surface IPC handlers consume.

## Exports

### `function restoreOrCleanupAuditWorkdirs`

Boot-time scan of `~/.nakiros/runs/audit/*`. Per persisted workdir: terminal runs are deleted; completed runs stay available for Terminer; in-flight runs collapse to `waiting_for_input` + `interruptedByReboot=true` when the Claude session file is still on disk, or collapse to `stopped` when the session file is gone (no usable session — Reprendre would otherwise surface "No conversation found").

```ts
export function restoreOrCleanupAuditWorkdirs(): void
```

### `function listActiveAuditRuns`

Return every in-memory audit run that's still in a non-terminal status (`starting` / `running` / `waiting_for_input`). Used by the UI to surface "audit running" badges.

```ts
export function listActiveAuditRuns(): AuditRun[]
```

### `function listAllAuditRuns`

Return every audit run currently held in memory — active **and** terminal (`completed` / `failed` / `stopped`). Used by the runs center so completed audits restored at boot can be revisited and dismissed by the user.

```ts
export function listAllAuditRuns(): AuditRun[]
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

### `function getAuditTimeline`

Build the audit-conversation timeline directly from Claude Code's session jsonl. Delegates to the shared `buildChatTimeline` (runner-core, extracted from this function and bootstrap-runner's near-identical `getBootstrapTimeline` — see `.claude/rules/runners.md`) — universal `user` / `assistant_text` / `tool` kinds; the audit-progress sidebar (manifest, sections, findings) is driven by a separate event stream and does not appear in this timeline. Filters Write/Edit/MultiEdit on Nakiros-internal artefacts (the audit-progress jsonl and the manifest json) via the `isAuditProgressPath` predicate so they don't surface as generic tool calls. Returns an empty array when the run has no sessionId yet or the file is missing.

```ts
export function getAuditTimeline(runId: string): AuditTimelineEntry[]
```

### `function getAuditUsage`

Compute the billed-equivalent + agent-active stats for an audit run by walking its Claude Code session JSONL. Delegates to the shared `computeSessionUsage` helper — same algorithm and pricing rules as fix and eval. Returns the empty-state value when the run has no sessionId yet.

```ts
export function getAuditUsage(runId: string): FixUsage
```
