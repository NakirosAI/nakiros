# loop-detector

**Path:** `apps/nakiros/src/services/drift/loop-detector.ts`

Detects loop drift in a Claude Code session by analysing the last 12 assistant turns for repeated tool actions with no forward progress. Four signals are tracked: Edit/Write/MultiEdit on the same file (threshold ≥ 4), Bash same command with error (threshold ≥ 3), Grep/Glob same pattern (threshold ≥ 5), Read same file (threshold ≥ 5). Returns a `DriftReport` when at least one signal exceeds its threshold; `null` otherwise.

## Exports

### `TriggeredSignature`

One fired signal in a loop drift report, included in `DriftReport.evidence.triggered`.

```ts
export interface TriggeredSignature {
  signature: string
  count: number
  threshold: number
}
```

- `signature` — human-readable label: `"<Label>:<key>"` (e.g. `"Edit:apps/foo/bar.ts"`)
- `count` — number of occurrences found in the analysis window
- `threshold` — the threshold that was exceeded

### `detectLoop`

```ts
export function detectLoop(allTurns: AssistantTurn[]): DriftReport | null
```

Analyse the last 12 assistant turns for loop patterns.

Requires at least 8 turns total — sessions with fewer turns are too young to judge and return `null`. Works on the last 12 turns (`WINDOW_SIZE`). For each `ToolUseEvent` in that window, extracts a `(signal, key)` pair: file path for Edit/Write/MultiEdit and Read, normalised command for Bash (only when `hasError` is true), pattern for Grep/Glob. Counts occurrences per `(signal, key)` pair. Any pair that exceeds its threshold is included in `triggered`. Severity is `high` when multiple signatures fire simultaneously OR any single signature exceeds its threshold by more than 50%; `medium` otherwise.

**Parameters:**
- `allTurns` — full ordered list of assistant turns for the session, as returned by `loadSessionTurns`

**Returns:** a `DriftReport` with `type: 'loop'` when drift is detected, `null` otherwise
