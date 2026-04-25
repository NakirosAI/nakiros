# ConversationTurn.tsx

**Path:** `apps/frontend/src/components/ConversationTurn.tsx`

Shared chat-style turn renderer used by every runner that streams a Claude Code conversation (eval, audit, fix). Renders ordered text + tool blocks the same way the Claude Code extension does, plus three small helpers for live streams, legacy-shape backfill, and provisional-turn bookkeeping.

## Exports

### `ConversationTurn`

```ts
export function ConversationTurn(props: { role; timestamp; blocks; streaming?; scrollRef? }): JSX.Element
```

A single conversation turn (user or assistant). Text blocks render as Markdown for assistants and plain text for users; tool blocks render as `name + display` lines, full width, no truncation. Optional `streaming` highlights the border, optional `scrollRef` lets the parent scroll the latest turn into view.

### `type LiveStreamEvent`

```ts
export type LiveStreamEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'tool'; name: string; display: string; ts: number };
```

Real-time event shape as it arrives off the IPC stream. Adds a timestamp on top of the persisted block shape.

### `liveEventsToBlocks`

```ts
export function liveEventsToBlocks(events: LiveStreamEvent[]): EvalRunTurnBlock[]
```

Strip the transient `ts` field, leaving the persisted `EvalRunTurnBlock` shape consumed by `ConversationTurn`.

### `legacyTurnToBlocks`

```ts
export function legacyTurnToBlocks(content: string, tools?: { name; display }[]): EvalRunTurnBlock[]
```

Backwards-compat helper for runs persisted before `blocks` existed. Synthesises a block list from the old `content` + `tools` fields. Ordering is approximate — text first, tools grouped after — because the original interleave is lost.

### `endsOnAssistant`

```ts
export function endsOnAssistant(turns: ReadonlyArray<{ role: 'user' | 'assistant' }>): boolean
```

True when the last persisted turn is an assistant turn. Used to decide whether the provisional "live" turn built from streaming events should be appended (it would duplicate the just-landed assistant turn otherwise).
