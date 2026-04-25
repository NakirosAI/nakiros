# ProjectOverview.tsx

**Path:** `apps/frontend/src/views/ProjectOverview.tsx`

Dashboard "Overview" tab — aggregates the latest N conversation analyses (10/30/90/all) for a project and surfaces high-level health signals: average score, compaction rate, cache waste, healthy/watch/degraded distribution, pattern insights, top failing tools, recurring hot files, top recurring tips and the most critical conversations to drill into. Loads analyses via `window.nakiros.listProjectConversationsWithAnalysis`, computes derivations using helpers from `ConversationsAggregation` (`aggregate`, `buildInsights`, `recurringHotFiles`, `topFailingTools`, `topTipFrequencies`), and opens `ConversationDiagnosticPanel` when the user picks a critical conversation. Mounted from `DashboardRouter` for the default project tab.

## Exports

### `default` — `ProjectOverview`

```ts
export default function ProjectOverview(props: Props): JSX.Element
```

Renders the overview header (window selector), four headline cards, the health-zone distribution bar, pattern insights, the top tips/tools/files grid, the critical conversations list, and the diagnostic panel when a conversation is selected. Props: `{ project: Project }`.
