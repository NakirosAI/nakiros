# ConversationsAggregation.ts

**Path:** `apps/frontend/src/components/conversations/ConversationsAggregation.ts`

Pure-functional aggregation utilities used by the Conversations Insights panel. All computed client-side from an already-analyzed list — no extra IPC needed. Surface-area: a stats reducer, a prioritised insight builder (i18n-keyed), and three top-N rollups (failing tools, recurring hot files, recurring tips).

## Exports

### `interface AggregatedStats`

Derived metrics across a population of conversations.

```ts
export interface AggregatedStats {
  totalCount: number;
  averageScore: number;
  compactionRate: number;
  degradedRate: number;
  frictionRate: number;
  lateFrictionRate: number;
  toolErrorRate: number;
  cacheWasteTotalTokens: number;
  cacheWasteAvgPerConv: number;
  healthyCount: number;
  watchCount: number;
  degradedCount: number;
}
```

### `interface AggregatedSignal`

```ts
export interface AggregatedSignal {
  /** Identifier matching an i18n key (`insights.<id>.title` / `.body`). */
  id: string;
  severity: 'info' | 'warning' | 'critical';
  /** Values for i18n interpolation. */
  data: Record<string, string | number>;
}
```

### `interface ToolErrorFrequency`

```ts
export interface ToolErrorFrequency {
  name: string;
  totalUses: number;
  totalErrors: number;
  errorRate: number;
  /** How many conversations in the window involved this tool. */
  affectedConvs: number;
}
```

### `interface HotFileFrequency`

```ts
export interface HotFileFrequency {
  path: string;
  /** In how many distinct conversations this file was flagged as hot. */
  convCount: number;
  totalEdits: number;
}
```

### `interface TipFrequency`

```ts
export interface TipFrequency {
  id: string;
  convCount: number;
  severity: 'info' | 'warning' | 'critical';
}
```

### `aggregate`

```ts
export function aggregate(convs: ConversationAnalysis[]): AggregatedStats
```

Reduces a population into a single `AggregatedStats` snapshot. Tolerates an empty list.

### `buildInsights`

```ts
export function buildInsights(stats: AggregatedStats, convs: ConversationAnalysis[]): AggregatedSignal[]
```

Turns the stats into prioritised insight ids the UI renders as cards. Returns an empty list below 3 conversations to avoid drawing conclusions on a sparse sample. Rules deliberately tight — surface patterns, not trivia. Sorted critical → warning → info.

### `topFailingTools`

```ts
export function topFailingTools(convs: ConversationAnalysis[], limit = 5): ToolErrorFrequency[]
```

Top-N tools that errored across the population, filtering out tools used fewer than 5 times.

### `recurringHotFiles`

```ts
export function recurringHotFiles(convs: ConversationAnalysis[], limit = 5): HotFileFrequency[]
```

Files flagged as hot in at least 2 distinct conversations — proxy for an architectural pain point.

### `topTipFrequencies`

```ts
export function topTipFrequencies(convs: ConversationAnalysis[], limit = 5): TipFrequency[]
```

Most recurring tip ids, keeping the worst-seen severity for each id.
