import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import type { LiveStreamEvent } from '../components/ConversationTurn';

/**
 * Shape of inner events emitted by audit/fix/create streams. A run-specific
 * event type narrows this further; the hook only touches text/tool/status
 * and the handler-level `error` variant emitted by `withBroadcastOnError`.
 */
export type RunStreamInnerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'status'; status: string }
  | { type: 'error'; error: string }
  | { type: string };

/**
 * IPC surface every runner exposes so the hook can fetch the current run,
 * replay any buffered events, and subscribe to live event envelopes.
 */
export interface RunStateApi<R, Ev extends RunStreamInnerEvent> {
  getRun: (id: string) => Promise<R | null>;
  getBufferedEvents: (id: string) => Promise<Ev[]>;
  onEvent: (cb: (envelope: { runId: string; event: Ev }) => void) => () => void;
}

/** Return value of {@link useRunState}: run state, setter, live events, scroll ref. */
export interface UseRunStateResult<R> {
  run: R;
  setRun: Dispatch<SetStateAction<R>>;
  liveEvents: LiveStreamEvent[];
  liveScrollRef: RefObject<HTMLDivElement | null>;
  /**
   * Latest handler-level error received on the channel (from
   * `withBroadcastOnError`). Cleared when a new turn starts. Out-of-band
   * relative to `run.error` (which carries runner failures). Display via
   * `RunErrorBanner` alongside or instead of `run.error`.
   */
  handlerError: string | null;
  /** Programmatically clear the handler error (e.g. after the user dismisses it). */
  clearHandlerError(): void;
}

/**
 * Unified run-stream state: polls `getRun` every 500ms, replays buffered
 * events on mount, and subscribes to the live stream. Text/tool events feed
 * `liveEvents`; `status` events mirror into `run.status` (so Stop/completion
 * feedback is immediate) and reset `liveEvents` when a fresh turn starts.
 *
 * Callers pass `onInnerEvent` for view-specific handling (audit's `done`,
 * fix's extra status wiring, …).
 */
export function useRunState<
  R extends { status: string },
  Ev extends RunStreamInnerEvent,
>(
  runId: string,
  initialRun: R,
  api: RunStateApi<R, Ev>,
  onInnerEvent?: (event: Ev) => void,
  /**
   * Polling cadence in ms. Defaults to `500` to preserve the legacy
   * runs (AuditView/FixView) behaviour. Pass `0` to disable polling
   * entirely — only the initial fetch + the live event subscription
   * drive the state. The new-design `RunScreen` uses `0` to avoid the
   * UI flicker caused by re-rendering at 2 Hz on a stable run.
   */
  pollIntervalMs: number = 500,
): UseRunStateResult<R> {
  const [run, setRun] = useState<R>(initialRun);
  const [liveEvents, setLiveEvents] = useState<LiveStreamEvent[]>([]);
  const [handlerError, setHandlerError] = useState<string | null>(null);
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const onInnerEventRef = useRef(onInnerEvent);
  onInnerEventRef.current = onInnerEvent;

  useEffect(() => {
    let mounted = true;
    async function refresh(): Promise<void> {
      const fresh = await api.getRun(runId);
      if (mounted && fresh) setRun(fresh);
    }
    void refresh();
    if (pollIntervalMs <= 0) {
      return () => {
        mounted = false;
      };
    }
    const interval = setInterval(refresh, pollIntervalMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [runId, api, pollIntervalMs]);

  useEffect(() => {
    void api.getBufferedEvents(runId).then((buffered) => {
      const now = Date.now();
      const replay: LiveStreamEvent[] = [];
      for (const ev of buffered) {
        if (ev.type === 'text') {
          replay.push({ type: 'text', text: (ev as { text: string }).text, ts: now });
        } else if (ev.type === 'tool') {
          const t = ev as { name: string; display: string };
          replay.push({ type: 'tool', name: t.name, display: t.display, ts: now });
        }
        // Forward every buffered event to the consumer so kind-specific
        // state (audit manifest / check results, eval per-iteration counts,
        // …) can be rebuilt on remount even if the live WebSocket dropped
        // an event mid-run. text/tool above feed liveEvents; everything
        // else is delivered exclusively through the inner-event hook.
        onInnerEventRef.current?.(ev);
      }
      if (replay.length > 0) setLiveEvents(replay);
    });
  }, [runId, api]);

  useEffect(() => {
    return api.onEvent(({ runId: id, event }) => {
      if (id !== runId) return;
      if (event.type === 'text') {
        const text = (event as { text: string }).text;
        setLiveEvents((prev) => [...prev, { type: 'text', text, ts: Date.now() }]);
      } else if (event.type === 'tool') {
        const t = event as { name: string; display: string };
        setLiveEvents((prev) => [...prev, { type: 'tool', name: t.name, display: t.display, ts: Date.now() }]);
      } else if (event.type === 'status') {
        const status = (event as { status: string }).status;
        if (status === 'starting') {
          setLiveEvents([]);
          // A new turn starts → clear stale handler error from a prior failure.
          setHandlerError(null);
        }
        setRun((prev) => ({ ...prev, status: status as R['status'] }));
      } else if (event.type === 'error') {
        setHandlerError((event as { error: string }).error);
      }
      onInnerEventRef.current?.(event);
    });
  }, [runId, api]);

  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveEvents]);

  return {
    run,
    setRun,
    liveEvents,
    liveScrollRef,
    handlerError,
    clearHandlerError: () => setHandlerError(null),
  };
}
