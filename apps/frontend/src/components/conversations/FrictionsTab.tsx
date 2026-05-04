import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ClassifyConvoRun,
  ClassifyConvoRunEvent,
  ConversationDigest,
} from '@nakiros/shared';
import { Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { launchClassifyConvo, type OpenRunTabCallback } from '../../lib/run-launcher';
import { DigestView } from './DigestView';

interface Props {
  projectId: string;
  sessionId: string;
  /**
   * Required to open the dedicated `classify-convo` RunScreen tab. Threaded
   * down from `NewShell.handleOpenRunByIds`. When omitted, the Classify button
   * is hidden because the run can't be surfaced anywhere.
   */
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'running'; run: ClassifyConvoRun }
  | { kind: 'ready'; digest: ConversationDigest }
  | { kind: 'error'; message: string };

/**
 * Drawer tab for the V1.1 friction classifier. Two-state UI:
 *
 * - **idle**: surfaces a "Classify" button that starts the streaming
 *   `classify-convo` runner and opens its dedicated RunScreen tab. Live
 *   feedback (tools, agent text, tokens) lives in that tab — not here —
 *   so the user can close the drawer without losing visibility.
 * - **ready**: renders the persisted digest via {@link DigestView}.
 *
 * If a run is already in flight on this session (because the user closed
 * and reopened the drawer), surfaces a "Open the running tab" affordance
 * and the run's current status, but does not duplicate the live stream.
 */
export function FrictionsTab({ projectId, sessionId, onOpenRunTab }: Props) {
  const { t } = useTranslation('conversations');
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  // Run id we're currently subscribed to — set when bootstrap finds a live
  // run on this (projectId, sessionId) or when we launch one ourselves.
  // Used to filter `onClassifyConvoEvent` envelopes.
  const subscribedRunIdRef = useRef<string | null>(null);

  // ── Bootstrap: digest first, then live run pickup ────────────────────────
  async function refresh(): Promise<void> {
    try {
      const [digest, activeRuns] = await Promise.all([
        window.nakiros.getConversationDigest(projectId, sessionId),
        window.nakiros.listActiveClassifyConvoRuns(),
      ]);
      const live = activeRuns.find(
        // Match on `sourceSessionId` (the conv being classified), not
        // `sessionId` (the spawned sub-run's Claude Code session id).
        (r) => r.projectId === projectId && r.sourceSessionId === sessionId,
      );
      if (live) {
        subscribedRunIdRef.current = live.runId;
        setState({ kind: 'running', run: live });
        return;
      }
      subscribedRunIdRef.current = null;
      if (digest) {
        setState({ kind: 'ready', digest });
        return;
      }
      setState({ kind: 'idle' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId]);

  // Subscribe to classify-convo events for the lifetime of the tab. When the
  // run we are watching emits `done` / `error` / `status:completed`, re-fetch
  // so the tab swaps from `running` to `ready` (or surfaces the error)
  // without requiring the user to close+reopen the drawer.
  useEffect(() => {
    const unsubscribe = window.nakiros.onClassifyConvoEvent((envelope: ClassifyConvoRunEvent) => {
      const runId = subscribedRunIdRef.current;
      if (!runId || envelope.runId !== runId) return;
      const ev = envelope.event;
      const isTerminal =
        ev.type === 'done' ||
        ev.type === 'error' ||
        (ev.type === 'status' && (ev.status === 'completed' || ev.status === 'failed'));
      if (isTerminal) {
        void refresh();
      }
    });
    return () => {
      unsubscribe();
    };
    // refresh closes over projectId/sessionId via the outer scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId]);

  async function classify() {
    if (!onOpenRunTab) return;
    setState({ kind: 'loading' });
    try {
      await launchClassifyConvo({ projectId, sessionId }, onOpenRunTab);
      // Refresh immediately so the tab picks up the freshly-started run via
      // `listActiveClassifyConvoRuns`, sets `subscribedRunIdRef`, and shows
      // the running view. The event subscription (above) will then trigger
      // another refresh when the run emits its `done` event, swapping the
      // tab to `ready` without any user action.
      await refresh();
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-n-muted">
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="px-5 py-6">
        <div className="rounded-n-md border border-n-critical-soft bg-n-critical-soft px-4 py-3 text-[12.5px] text-n-critical">
          {state.message}
        </div>
        <button
          type="button"
          onClick={classify}
          disabled={!onOpenRunTab}
          className="mt-3 inline-flex items-center gap-1.5 rounded-n-sm bg-n-raised px-3 py-1.5 text-[12px] font-medium text-n-fg hover:bg-n-canvas disabled:opacity-40"
        >
          {t('frictions.retry', { defaultValue: 'Retry' })}
        </button>
      </div>
    );
  }

  if (state.kind === 'running') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="animate-spin text-n-accent" size={20} />
        <div className="text-[13px] text-n-muted max-w-md">
          {t('frictions.runningHere', {
            defaultValue:
              'A classification is currently running on this conversation. Open its run tab to follow the agent live.',
          })}
        </div>
        <div className="font-n-mono text-[11px] text-n-faint">
          {state.run.model} · {state.run.status}
        </div>
        {onOpenRunTab && (
          <button
            type="button"
            onClick={() =>
              onOpenRunTab({
                runId: state.run.runId,
                runKind: 'classify-convo',
                label: `Classify · ${state.run.sourceSessionId.slice(0, 8)}`,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-n-sm bg-n-accent px-3.5 py-1.5 text-[12.5px] font-medium text-n-on-accent hover:opacity-90"
          >
            <ExternalLink size={13} />
            {t('frictions.openRunTab', { defaultValue: 'Open run tab' })}
          </button>
        )}
      </div>
    );
  }

  if (state.kind === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-[13px] text-n-muted max-w-md">
          {t('frictions.empty', {
            defaultValue:
              'No digest yet. Run the classifier to detect semantic frictions and extract candidate rules from this conversation.',
          })}
        </div>
        <button
          type="button"
          onClick={classify}
          disabled={!onOpenRunTab}
          className="inline-flex items-center gap-1.5 rounded-n-sm bg-n-accent px-3.5 py-1.5 text-[12.5px] font-medium text-n-on-accent hover:opacity-90 disabled:opacity-40"
        >
          <Sparkles size={13} />
          {t('frictions.generate', { defaultValue: 'Classify (Haiku)' })}
        </button>
      </div>
    );
  }

  return <DigestView digest={state.digest} onRegenerate={classify} />;
}
