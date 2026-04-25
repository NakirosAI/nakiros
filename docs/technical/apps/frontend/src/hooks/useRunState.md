# useRunState.ts

**Path:** `apps/frontend/src/hooks/useRunState.ts`

Unified run-stream state for audit / fix / create / eval views. Polls the
run record, replays buffered events on mount, subscribes to live events,
and merges status changes into the run.

## Exports

### `RunStreamInnerEvent`

```ts
type RunStreamInnerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'status'; status: string }
  | { type: string };
```

Inner event shape emitted by every runner stream.

### `RunStateApi<R, Ev>`

```ts
interface RunStateApi<R, Ev extends RunStreamInnerEvent> {
  getRun(id: string): Promise<R | null>;
  getBufferedEvents(id: string): Promise<Ev[]>;
  onEvent(cb: (envelope: { runId: string; event: Ev }) => void): () => void;
}
```

IPC surface every runner exposes for the hook to consume.

### `UseRunStateResult<R>`

```ts
interface UseRunStateResult<R> {
  run: R;
  setRun: Dispatch<SetStateAction<R>>;
  liveEvents: LiveStreamEvent[];
  liveScrollRef: RefObject<HTMLDivElement | null>;
}
```

### `useRunState`

```ts
function useRunState<R extends { status: string }, Ev extends RunStreamInnerEvent>(
  runId: string,
  initialRun: R,
  api: RunStateApi<R, Ev>,
  onInnerEvent?: (event: Ev) => void,
): UseRunStateResult<R>;
```

Polls `getRun` every 500 ms, replays buffered text/tool events, and feeds
live `text` / `tool` events into `liveEvents`. `status` events mirror into
`run.status` (so Stop/completion feedback is immediate) and reset
`liveEvents` on `'starting'`. Auto-scrolls `liveScrollRef` to the bottom on
each new event. `onInnerEvent` is forwarded to callers for view-specific
handling.
