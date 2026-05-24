# context-detector

**Path:** `apps/nakiros/src/services/drift/context-detector.ts`

Detects context pollution drift — the accumulated context has grown large enough, and the conversation has shifted topics enough, that the agent risks confusing past and present tasks. Combines context window pressure (`contextUsageRatio`) with topic divergence metrics (reused from `topic-detector.ts` via `computeTopicMetrics`). Purely synchronous; no I/O. Consumed by `drift-analyzer.ts` as stage 4 (after loop and topic detectors). Only fires when the topic detector did not already fire — ordering in the analyzer guarantees no double-reporting.

## Exports

### `detectContext`

```ts
export function detectContext(
  contextMetrics: ContextMetrics,
  userMessages: UserMessage[],
): DriftReport | null
```

Analyse a session for context pollution drift.

Trigger conditions (all three must hold):
1. `contextUsageRatio >= 0.50` — at least half the context window occupied.
2. `topicMetrics.transitionsDetected >= 1` — at least one topic transition.
3. `topicMetrics.firstLastSimilarity < 0.20` — first and last messages share fewer than 20% of their keywords.

Minimum 10 user messages required (shorter sessions lack macro signal).

Severity:
- `high` when `contextUsageRatio >= 0.75`, OR when `transitions >= 2` AND `firstLastSimilarity < 0.10`.
- `medium` otherwise.

The returned `DriftReport.evidence` object contains:

| Field | Type | Description |
|-------|------|-------------|
| `contextUsageRatio` | `number` | `maxContextTokens / contextWindow` |
| `contextUsageThreshold` | `0.50` | Minimum ratio to fire |
| `maxContextTokens` | `number` | Peak context token count observed in the session |
| `contextWindow` | `number` | Inferred context window (200 k or 1 M) |
| `userMessageCount` | `number` | Total user messages in the session |
| `transitionsDetected` | `number` | Topic transitions in the considered window |
| `firstLastSimilarity` | `number` | Jaccard between first and last user message |

**Parameters:**
- `contextMetrics` — peak token count and inferred window size, as returned by `loadContextMetrics`
- `userMessages` — ordered list of real user messages, as returned by `loadUserMessages`

**Returns:** a `DriftReport` with `type: 'context'` when context pollution is detected, `null` otherwise
