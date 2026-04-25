# ConversationDeepAnalysisSection.tsx

**Path:** `apps/frontend/src/components/conversations/ConversationDeepAnalysisSection.tsx`

Deep (LLM-powered) analysis section of the diagnostic panel. Eagerly checks if a cached report exists on mount, offers a one-click run when absent, and picks model/cost transparently so the user knows what they're paying. Result is cached on disk by the daemon, so subsequent visits skip the LLM call.

## Exports

### `ConversationDeepAnalysisSection`

```ts
export function ConversationDeepAnalysisSection(props: { project; analysis }): JSX.Element
```

Three render branches: checking (loader), no cached report (pitch + Run button + model/token estimate), cached report (markdown viewer + rerun control). Uses IPC: `loadConversationDeepAnalysis` and `deepAnalyzeConversation`.

```ts
interface Props {
  /** Active project — passed to the daemon to scope the report on disk. */
  project: Project;
  /** Stage-1 deterministic analysis used both as input and to estimate cost. */
  analysis: ConversationAnalysis;
}
```
