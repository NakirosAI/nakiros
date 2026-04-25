# event-log.ts

**Path:** `apps/nakiros/src/services/runner-core/event-log.ts`

Persistent, bounded event log for a run. Responsibilities:

1. **Broadcast** every emitted event to the runner's live listener (WebSocket fan-out).
2. **Buffer** the events of the CURRENT turn in memory (capped) so the frontend can replay them when it remounts mid-turn — avoids "I came back and the stream is empty even though the audit is still running".
3. **Persist** those same events to `{workdir}/events.jsonl` so the buffer survives a daemon restart. On boot, call `restore()` to re-hydrate the ring.
4. **Clear** both buffer and file at turn boundaries (`resetForNewTurn`) so only the in-flight turn is replayable — previous turns already live in `run.turns[]`.

The log is purely a resumption aid. Once the user acknowledges the run's outcome (commit/deploy/terminer), the workdir — including `events.jsonl` — is deleted.

## Exports

### `interface EventLogOptions<TEvent>`

Options for constructing an `EventLog`.

```ts
export interface EventLogOptions<TEvent> {
  workdir: string;
  broadcast: (event: TEvent) => void;
  /** Cap on buffered events per turn. Default 500. */
  maxBuffered?: number;
  /** Predicate for events that should be buffered/persisted for replay.
   *  Default: only text + tool events. */
  shouldBuffer?: (event: TEvent) => boolean;
}
```

### `class EventLog<TEvent>`

Broadcast + buffer + persist log. One instance per run.

#### `emit(event)`

Broadcast, buffer (if replay-worthy), and persist. Persistence is best-effort — a failing disk append must not break the live stream.

#### `resetForNewTurn()`

Clear buffer and truncate the on-disk log. Call when starting a new turn so the replay shows only the in-flight turn.

#### `getBuffered()`

Return a snapshot of the currently buffered events for frontend replay.

#### `restore()`

Re-hydrate the in-memory buffer from `events.jsonl`. Used by the daemon's boot-time recovery so a user who reopens the UI after a restart still sees the last streamed chunks of an interrupted turn.

#### `destroy()`

Delete the on-disk log. Called when the run's workdir is torn down.
