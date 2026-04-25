# ConversationsView.tsx

**Path:** `apps/frontend/src/views/ConversationsView.tsx`

Dashboard tab listing every analyzed Claude Code JSONL conversation for a project, ranked health-first (lowest score = most worth investigating). Loads analyses via `window.nakiros.listProjectConversationsWithAnalysis`, supports filter/sort presets (critical, compactions, friction, cache waste, tool errors), and opens `ConversationDiagnosticPanel` on row click for the narrative diagnostic. Reached via `Sidebar` → "conversations" route.

## Exports

### `default` — `ConversationsView`

```ts
export default function ConversationsView(props: Props): JSX.Element
```

Renders the filter/sort header, the conversation row list, and the diagnostic panel when a conversation is selected. Props: `{ project: Project }`.
