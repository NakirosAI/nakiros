# topic-detector

**Path:** `apps/nakiros/src/services/drift/topic-detector.ts`

Detects topic drift — the session has progressively shifted away from its original objective without a `/clear` having reset the context. Uses Jaccard similarity on tokenized user messages (via `tokenizeForCluster` + `jaccard` from `runner-core/cluster-tokens`) to measure both consecutive-message transitions and first-to-last distance. Purely synchronous; no I/O. Exposes two public functions: `computeTopicMetrics` (shared primitive, consumed by the context detector) and `detectTopic` (full drift report, consumed by `drift-analyzer.ts` as stage 3).

## Exports

### `TopicMetrics`

Raw topic-drift metrics returned by `computeTopicMetrics`. Shared between `detectTopic` and the context detector so both can reason about topic divergence without duplicating logic.

```ts
export interface TopicMetrics {
  transitionsDetected: number
  firstLastSimilarity: number
  userMessageCount: number
}
```

- `transitionsDetected` — number of consecutive user-message pairs with `jaccard < 0.15`
- `firstLastSimilarity` — Jaccard similarity between the first and last user message in the considered window
- `userMessageCount` — number of user messages in the window (after optional `/clear` trim)

### `computeTopicMetrics`

```ts
export function computeTopicMetrics(userMessages: UserMessage[]): TopicMetrics | null
```

Compute raw topic-drift metrics from a list of user messages without deciding whether drift has occurred.

Applies the same `/clear` windowing and Jaccard analysis as `detectTopic` but returns raw counters. Returns `null` when the considered window is shorter than 6 messages. Intended for reuse by the context detector, which needs the same metrics but constructs a different `DriftReport`.

**Parameters:**
- `userMessages` — ordered list of real user messages for the session

**Returns:** `TopicMetrics` with transition count and first-last similarity, or `null` if too few messages

### `detectTopic`

```ts
export function detectTopic(userMessages: UserMessage[]): DriftReport | null
```

Analyse user messages for topic drift.

Steps:
1. If a `/clear` command appears in the messages, only messages **after the last `/clear`** are considered (the clear resets the objective).
2. Requires at least 6 messages in the considered window — returns `null` if fewer.
3. Tokenizes each message with `tokenizeForCluster` (FR+EN stop words removed, ≥ 3 chars).
4. Counts transitions: consecutive pairs where `jaccard < 0.15`.
5. Computes first–last similarity: `jaccard(tokens[0], tokens[last])`.
6. Triggers when `transitions >= 2` AND `firstLastSimilarity < 0.10`.
7. Severity: `high` when `transitions >= 3` OR `firstLastSimilarity < 0.05`; `medium` otherwise.

The returned `DriftReport.evidence` object contains:

| Field | Type | Description |
|-------|------|-------------|
| `userMessageCount` | `number` | Messages considered (after optional /clear trim) |
| `transitionsDetected` | `number` | Consecutive pairs below transition threshold |
| `transitionThreshold` | `0.15` | Jaccard threshold for a transition |
| `firstLastSimilarity` | `number` | Jaccard between first and last message tokens |
| `firstLastThreshold` | `0.10` | Minimum first-last similarity to avoid triggering |
| `clearSlashFound` | `boolean` | Whether a `/clear` was found in the session |
| `consideredAfterClearIdx` | `number \| null` | Index of first message considered (after /clear), or null |

**Parameters:**
- `userMessages` — ordered list of real user messages, as returned by `loadUserMessages`

**Returns:** a `DriftReport` with `type: 'topic'` when drift is detected, `null` otherwise
