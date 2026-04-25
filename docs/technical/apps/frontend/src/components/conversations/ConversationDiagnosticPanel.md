# ConversationDiagnosticPanel.tsx

**Path:** `apps/frontend/src/components/conversations/ConversationDiagnosticPanel.tsx`

Modal-style panel that renders the full diagnostic for a single conversation: tips, deep-analysis trigger, timeline + health badges, key fields, cache efficiency, top tools, hot files, and an opt-in raw message dump fetched via `getProjectConversationMessages`. Opened from `ConversationsView`; the panel itself owns no routing state.

## Exports

### `ConversationDiagnosticPanel`

```ts
export function ConversationDiagnosticPanel(props: { project; analysis; onClose }): JSX.Element
```

Composes `ConversationTimeline`, `ConversationHealthBadges`, `ConversationDeepAnalysisSection` plus a handful of inline subcomponents (`TipsSection`, `Field`, `ScoreChip`, `RawMessageList`) wrapped in the shared `Modal`. The raw message list is lazy — fetched only when the user clicks the "show raw" link.

```ts
interface Props {
  project: Project;
  analysis: ConversationAnalysis;
  onClose: () => void;
}
```
