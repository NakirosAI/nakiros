# recommendation-analyze-runner

**Path:** `apps/nakiros/src/services/recommendation-analyze-runner.ts`

Single-turn runner that spawns a Claude Code (sonnet) subprocess to analyse a
friction pattern. The agent reads `pattern.json` (hydrated zones) and
`inventory.json` (existing `.claude/` artefacts) from the run workdir, then
writes 1..N markdown recommendation cards to `./recos/`. After the turn,
`onTurnComplete` parses each card via `recommendation-card-parser`, persists
valid cards via `recommendation-store.writeRecoCard`, and updates the pattern's
`analysis` block. Mirrors `classify-convo-runner.ts` for runner-core
integration.

## Exports

### `RecommendationAnalyzeRunOpts`

```ts
export interface RecommendationAnalyzeRunOpts {
  projectPath: string;
  providerProjectDir: string;
  onEvent(event: RecommendationAnalyzeRunEvent): void;
}
```

Options resolved by the IPC handler before calling `startRecommendationAnalyze`.
`projectPath` is the absolute path to the project root; `providerProjectDir` is
the Claude Code provider dir used by `peekCachedAnalysis`; `onEvent` receives
every broadcast event.

---

### `restoreOrCleanupRecommendationAnalyzeWorkdirs`

```ts
export function restoreOrCleanupRecommendationAnalyzeWorkdirs(): void
```

Boot recovery. Called once during daemon startup to rehydrate or clean up
persisted run workdirs from a previous daemon process.

---

### `startRecommendationAnalyze`

```ts
export function startRecommendationAnalyze(
  req: StartRecommendationAnalyzeRequest,
  opts: RecommendationAnalyzeRunOpts,
): RecommendationAnalyzeRun
```

Start (or rebind to an active) recommendation analyser run for the given
pattern. Idempotent on `(projectId, patternId)` — calling this while an active
run exists simply rebinds the event log and returns the existing run.

**Parameters:**
- `req` — IPC request carrying `projectId` + `patternId`.
- `opts` — Caller-resolved context (`projectPath`, `providerProjectDir`, `onEvent`).

**Returns:** The current (or freshly started) `RecommendationAnalyzeRun`.

---

### `stopRecommendationAnalyze`

```ts
export function stopRecommendationAnalyze(runId: string): void
```

Cancel an in-flight recommendation analyser run. No-op when the run is already
in a terminal state or unknown.

**Parameters:**
- `runId` — The `runId` of the run to stop.

---

### `getRecommendationAnalyzeRun`

```ts
export function getRecommendationAnalyzeRun(runId: string): RecommendationAnalyzeRun | null
```

Look up a recommendation analyser run by id.

**Parameters:**
- `runId` — The `runId` to look up.

**Returns:** The run, or `null` when unknown.

---

### `listActiveRecommendationAnalyzeRuns`

```ts
export function listActiveRecommendationAnalyzeRuns(): RecommendationAnalyzeRun[]
```

List all active (non-terminal) recommendation analyser runs across all projects.

**Returns:** Array of active `RecommendationAnalyzeRun` objects.

---

### `getRecommendationAnalyzeBufferedEvents`

```ts
export function getRecommendationAnalyzeBufferedEvents(runId: string): AnalyzeEvent[]
```

Return the replay buffer of events for the given run. Used when a frontend
component mounts after the run has already started so it can catch up on missed
events without re-subscribing.

**Parameters:**
- `runId` — The `runId` of the target run.

**Returns:** Array of buffered events, oldest first.
