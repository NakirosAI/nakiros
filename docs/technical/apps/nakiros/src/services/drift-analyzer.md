# drift-analyzer.ts

**Path:** `apps/nakiros/src/services/drift-analyzer.ts`

Drift detection service for Claude Code sessions. Wires three detectors in
order — loop → topic → context — and exposes two entry points:

- `analyzeDrift(sessionId)` — self-contained async entry point for the HTTP
  hook endpoint (`GET /api/drift`). Reads the JSONL internally.
- `analyzeDriftFromPreparsed(data)` — synchronous variant called by
  `conversation-analyzer.ts` to avoid double-reading the JSONL.

`DriftType` and `DriftReport` are re-exported so callers importing from this
module work unchanged. The canonical source of truth for the shared types is
`packages/shared/src/types/project.ts` (`DriftType`, `ConversationDrift`).

## Exports

### `DriftType`

```ts
export type DriftType = 'loop' | 'topic' | 'context';
```

Re-export of `DriftType` from `@nakiros/shared`. The three drift archetypes
Nakiros can detect.

### `DriftReport`

```ts
export type DriftReport = ConversationDrift;
```

Type alias for `ConversationDrift` from `@nakiros/shared`. Sub-modules
(`loop-detector`, `topic-detector`, `context-detector`) import this alias so
they stay decoupled from the shared package.

| Field | Description |
|-------|-------------|
| `type` | Which drift archetype was detected. |
| `severity` | `'low' | 'medium' | 'high'` |
| `message` | Short FR message to surface in the UI (1–2 sentences). |
| `suggestion` | Concrete next step for the user (e.g. `/clear`). |
| `evidence` | Raw counters / signatures for debug and future UI use. |

### `PreparsedSessionData`

```ts
export interface PreparsedSessionData {
  assistantTurns: AssistantTurn[];
  userMessages: UserMessage[];
  contextMetrics: ContextMetrics;
}
```

Arguments pre-extracted by `conversation-analyzer.ts`, passed to
`analyzeDriftFromPreparsed` to avoid reading the session JSONL twice.

| Field | Type | Description |
|-------|------|-------------|
| `assistantTurns` | `AssistantTurn[]` | Ordered list of assistant turns with tool-use events. |
| `userMessages` | `UserMessage[]` | Ordered list of real user messages (text-only, no tool_result entries). |
| `contextMetrics` | `ContextMetrics` | Peak context token metrics (maxContextTokens, contextWindow). |

### `analyzeDrift`

```ts
export async function analyzeDrift(
  sessionId: string,
  opts?: { force?: DriftType }
): Promise<DriftReport | null>
```

Self-contained async entry point for the `GET /api/drift` HTTP endpoint.
Reads and parses the session JSONL internally via `session-loader.ts`.

Detection order: loop → topic → context. Context detector is skipped when
topic already fired (prevents double-reporting).

**Parameters:**
- `sessionId` — UUID of the Claude Code session to analyse.
- `opts.force` — when set, bypasses real detection and returns a pre-built
  stub for the given drift type (plumbing validation only).

**Returns:** A `DriftReport` when drift is detected (or forced), `null` otherwise.

### `analyzeDriftFromPreparsed`

```ts
export function analyzeDriftFromPreparsed(
  data: PreparsedSessionData
): DriftReport | null
```

Synchronous variant called by `conversation-analyzer.ts` to run all three
drift detectors against data already parsed during the main conversation
analysis pass. Avoids double-reading the JSONL file.

Detection order is identical to `analyzeDrift`: loop → topic → context.
Context detector is suppressed when topic already fired.

**Parameters:**
- `data` — pre-parsed session data (`assistantTurns`, `userMessages`, `contextMetrics`).

**Returns:** A `DriftReport` when drift is detected, `null` otherwise.
