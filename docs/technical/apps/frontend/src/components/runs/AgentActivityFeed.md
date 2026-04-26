# AgentActivityFeed.tsx

**Path:** `apps/frontend/src/components/runs/AgentActivityFeed.tsx`

Chat-style activity feed shared by every run kind (audit / fix / create / eval). Renders persisted turns, an in-flight assistant bubble while the agent is streaming, and a `ThinkingIndicator` when no chunk has landed yet for the current turn.

## Exports

### `AgentActivityFeed`

```ts
export function AgentActivityFeed(props: {
  turns: AuditRunTurn[];
  liveEvents: LiveStreamEvent[];
  liveScrollRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  thinkingVerbs?: string[];
  variant?: 'page' | 'inline';
}): JSX.Element
```

Maps each persisted turn to a `ConversationTurn` (handling the legacy `content` + `tools` fallback for runs without `blocks`). When streaming AND live events have landed AND the last persisted turn is not assistant, appends a provisional streaming `ConversationTurn`. When streaming AND no live event yet, appends `ThinkingIndicator`. `thinkingVerbs` defaults to the shared `runs:thinking.verbs`; pass a kind-specific array (e.g. `t('audit:thinking.verbs')`) for more flavour.

`variant: 'page'` (default) wraps the feed in a `flex-1 overflow-y-auto p-4` scroll container with a centered `max-w-[900px]` column — used by `AuditView` / `FixView` where the feed IS the page body. `variant: 'inline'` drops the wrapper so the feed can sit inside another scroll container alongside other panels — used by `EvalRunsView`'s detail pane.
