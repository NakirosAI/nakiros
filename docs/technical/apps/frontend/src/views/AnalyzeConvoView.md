# AnalyzeConvoView.tsx

**Path:** `apps/frontend/src/views/AnalyzeConvoView.tsx`

Streaming counterpart of the legacy one-shot `deepAnalyzeConversation` flow. Promotes deep conversation analysis into a first-class agent run kind: composes the shared run library so users see the analysis happen live (read JSONL, tool calls, draft report), can pivot it mid-flight ("focus on cache compaction") via the human-interaction panel, and re-open it deep-linked from the runs center after completion.

Replaces the modal-bound `ConversationDeepAnalysisSection` flow per the project rule "a run never lives in a modal — a modal can trigger one, never contain it".

## Exports

### `default` — `AnalyzeConvoView`

```ts
export default function AnalyzeConvoView(props: Props): JSX.Element
```

React component implementing the full-screen overlay. Subscribes to `analyzeConvo:event` via `useRunState`, displays a tabbed view (`conversation` / `report`) that flips to the report once `done` lands and the cached markdown is loaded via `loadConversationDeepAnalysis`. Composes `RunControlHeader` (with `RunInterruptedBadge`), `AgentActivityFeed`, `HumanInteractionPanel` and `RunErrorBanner`.

Props: `initialRun: AnalyzeConvoRun` (snapshot returned by `startAnalyzeConvo`) and `onClose: () => void` (closes the overlay; the parent typically refreshes the diagnostic panel).

The "Reprendre" button surfaces only when `run.interruptedByReboot && status === 'waiting_for_input'` — sends `RESUME_PROMPTS.eval` (used as a generic continuation prompt; the analysis agent doesn't have a dedicated kind in the prompt registry).
