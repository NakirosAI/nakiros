# useConversationAnalyses.ts

**Path:** `apps/frontend/src/hooks/useConversationAnalyses.ts`

Fetches the per-conversation analyses for a project via the `project:listProjectConversationsWithAnalysis` channel. Returns `null` while the request is in flight (treat as "loading"), then the array.

## Exports

### `function useConversationAnalyses`

Re-runs when `projectId` changes — pending requests for the previous id are ignored (no late state update).

```ts
export function useConversationAnalyses(projectId: string): ConversationAnalysis[] | null
```
