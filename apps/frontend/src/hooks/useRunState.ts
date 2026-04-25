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
 * event type narrows this further; the hook only touches text/tool/status.
 */
export type RunStreamInnerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'status'; status: string }
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
): UseRunStateResult<R> {
  const [run, setRun] = useState<R>(initialRun);
  const [liveEvents, setLiveEvents] = useState<LiveStreamEvent[]>([]);
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
    const interval = setInterval(refresh, 500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [runId, api]);

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
        if (status === 'starting') setLiveEvents([]);
        setRun((prev) => ({ ...prev, status: status as R['status'] }));
      }
      onInnerEventRef.current?.(event);
    });
  }, [runId, api]);

  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveEvents]);

  return { run, setRun, liveEvents, liveScrollRef };
}
