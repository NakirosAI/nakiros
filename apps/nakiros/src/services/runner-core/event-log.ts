import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Persistent, bounded event log for a run.
 *
 * Responsibilities:
 *  1. Broadcast every emitted event to the runner's live listener (websocket fan-out).
 *  2. Buffer the events of the CURRENT turn in memory (capped) so the frontend can
 *     replay them when it remounts mid-turn — no more "I came back and the stream
 *     is empty even though the audit is still running".
 *  3. Persist those same events to `{workdir}/events.jsonl` so the buffer survives a
 *     daemon restart. On boot, call `restore()` to re-hydrate the in-memory ring.
 *  4. Clear both buffer and file at turn boundaries (`resetForNewTurn`) so only the
 *     in-flight turn is replayable; previous turns live in `run.turns[]`.
 *
 * The log is purely a resumption aid. Once the user acknowledges the run's outcome
 * (commit/deploy/terminer), the workdir — including events.jsonl — is deleted.
 */
/** Options for constructing an {@link EventLog}. */
export interface EventLogOptions<TEvent> {
  workdir: string;
  broadcast: (event: TEvent) => void;
  /** Cap on buffered events per turn. Default 500. */
  maxBuffered?: number;
  /**
   * Predicate for events that should be buffered/persisted for replay.
   * Default: only text + tool events (status/tokens/waiting/done don't need replay).
   */
  shouldBuffer?: (event: TEvent) => boolean;
}

const DEFAULT_MAX_BUFFERED = 500;
const EVENTS_FILE = 'events.jsonl';

function defaultShouldBuffer(event: unknown): boolean {
  const type = (event as { type?: unknown })?.type;
  return type === 'text' || type === 'tool';
}

export class EventLog<TEvent> {
  private readonly filePath: string;
  private readonly broadcast: (event: TEvent) => void;
  private readonly maxBuffered: number;
  private readonly shouldBuffer: (event: TEvent) => boolean;
  private buffer: TEvent[] = [];

  constructor(opts: EventLogOptions<TEvent>) {
    this.filePath = join(opts.workdir, EVENTS_FILE);
    this.broadcast = opts.broadcast;
    this.maxBuffered = opts.maxBuffered ?? DEFAULT_MAX_BUFFERED;
    this.shouldBuffer = opts.shouldBuffer ?? (defaultShouldBuffer as (e: TEvent) => boolean);
  }

  /** Broadcast, buffer (if replay-worthy), and persist. */
  emit(event: TEvent): void {
    this.broadcast(event);
    if (!this.shouldBuffer(event)) return;

    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffered) this.buffer.shift();

    try {
      appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
    } catch {
      // Persistence is best-effort. A failing append (disk full, permission) must
      // not break the live stream — the in-memory buffer is still valid for
      // same-session replays.
    }
  }

  /**
   * Clear buffer and truncate the on-disk log. Call when starting a new turn so
   * the replay shows only the in-flight turn, matching run.turns[] for history.
   */
  resetForNewTurn(): void {
    this.buffer = [];
    try {
      writeFileSync(this.filePath, '', 'utf8');
    } catch {
      // ignore
    }
  }

  /** Return a snapshot of the currently buffered events for frontend replay. */
  getBuffered(): TEvent[] {
    return this.buffer.slice();
  }

  /**
   * Re-hydrate the in-memory buffer from `events.jsonl`. Used by the daemon's
   * boot-time recovery so a user who reopens the UI after a daemon restart
   * still sees the last streamed chunks of an interrupted turn.
   */
  restore(): void {
    if (!existsSync(this.filePath)) return;
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch {
      return;
    }
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const recent = lines.slice(-this.maxBuffered);
    const restored: TEvent[] = [];
    for (const line of recent) {
      try {
        restored.push(JSON.parse(line) as TEvent);
      } catch {
        // ignore corrupt lines
      }
    }
    this.buffer = restored;
  }

  /** Delete the on-disk log. Called when the run's workdir is torn down. */
  destroy(): void {
    this.buffer = [];
    try {
      rmSync(this.filePath, { force: true });
    } catch {
      // ignore
    }
  }
}
