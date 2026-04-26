import { useEffect, useState } from 'react';
import {
  CheckCircle,
  FileText,
  MessageSquare,
  RotateCw,
  Sparkles,
  Square,
} from 'lucide-react';
import type {
  AnalyzeConvoRun,
  AnalyzeConvoRunEvent,
  ConversationDeepAnalysis,
} from '@nakiros/shared';
import { useTranslation } from 'react-i18next';
import { LoadingState, MarkdownViewer, TabButton } from '../components/ui';
import {
  AgentActivityFeed,
  HumanInteractionPanel,
  RESUME_PROMPTS,
  RunControlHeader,
  RunErrorBanner,
  RunInterruptedBadge,
} from '../components/runs';
import { agentRunStore } from '../lib/agent-run-store';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { useRunState } from '../hooks/useRunState';

interface Props {
  /** Run snapshot returned by `startAnalyzeConvo`. */
  initialRun: AnalyzeConvoRun;
  /** Closes the overlay; the parent typically refreshes the diagnostic panel. */
  onClose(): void;
}

type Tab = 'conversation' | 'report';

const ANALYZE_CONVO_API = {
  getRun: (id: string) => window.nakiros.getAnalyzeConvoRun(id),
  getBufferedEvents: (id: string) => window.nakiros.getAnalyzeConvoBufferedEvents(id),
  onEvent: window.nakiros.onAnalyzeConvoEvent,
};

const RESUME_PROMPT = RESUME_PROMPTS['eval'];

/**
 * Streaming counterpart of the legacy one-shot `deepAnalyzeConversation` flow.
 * Composes the shared run library so users see the analysis happen live, can
 * pivot it ("focus on the cache compaction angle") via the human-interaction
 * panel, and re-open it deep-linked from the runs center after completion.
 */
export default function AnalyzeConvoView({ initialRun, onClose }: Props) {
  const { t: tRuns } = useTranslation('runs');
  const [tab, setTab] = useState<Tab>('conversation');
  const [report, setReport] = useState<ConversationDeepAnalysis | null>(null);

  const { run, liveEvents, liveScrollRef, handlerError } = useRunState<
    AnalyzeConvoRun,
    AnalyzeConvoRunEvent['event']
  >(initialRun.runId, initialRun, ANALYZE_CONVO_API, (inner) => {
    if (inner.type === 'done' && (inner as { reportPath?: string }).reportPath) {
      void window.nakiros
        .loadConversationDeepAnalysis(initialRun.projectId, initialRun.sessionId)
        .then((r) => {
          if (r) setReport(r);
        });
      setTab('report');
    }
  });
  const elapsed = useElapsedTimer(initialRun.startedAt);

  useEffect(() => {
    if (run.status === 'completed' && run.reportPath && !report) {
      void window.nakiros
        .loadConversationDeepAnalysis(initialRun.projectId, initialRun.sessionId)
        .then((r) => {
          if (r) setReport(r);
        });
    }
  }, [run.status, run.reportPath, report, initialRun.projectId, initialRun.sessionId]);

  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';

  async function handleSend(message: string) {
    await window.nakiros.sendAnalyzeConvoUserMessage(initialRun.runId, message);
  }

  async function handleResume() {
    await window.nakiros.sendAnalyzeConvoUserMessage(initialRun.runId, RESUME_PROMPT);
  }

  async function handleStop() {
    await window.nakiros.stopAnalyzeConvo(initialRun.runId);
  }

  async function handleFinish() {
    await window.nakiros.finishAnalyzeConvo(initialRun.runId);
    agentRunStore.dismiss(initialRun.runId);
    onClose();
  }

  const headerActions = (
    <>
      {run.interruptedByReboot && isWaiting && (
        <button
          onClick={handleResume}
          className="ml-2 flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-amber-400 transition-colors hover:bg-amber-500/30"
        >
          <RotateCw size={12} />
          {tRuns('resume')}
        </button>
      )}
      {isRunning && (
        <button
          onClick={handleStop}
          className="ml-2 flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/30"
        >
          <Square size={12} />
          {tRuns('stop')}
        </button>
      )}
      {run.status === 'completed' && (
        <button
          onClick={handleFinish}
          className="ml-2 flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 transition-colors hover:bg-emerald-500/30"
        >
          <CheckCircle size={12} />
          {tRuns('finish')}
        </button>
      )}
    </>
  );

  const headerExtras = (
    <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
      <TabButton active={tab === 'conversation'} onClick={() => setTab('conversation')}>
        <MessageSquare size={12} />
        Conversation
      </TabButton>
      <TabButton active={tab === 'report'} onClick={() => setTab('report')} disabled={!report}>
        <FileText size={12} />
        {report ? 'Report' : 'Report (pending)'}
      </TabButton>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg)]">
      <RunControlHeader
        status={run.status}
        title={`Deep analysis — ${initialRun.sessionId.slice(0, 8)}`}
        icon={<Sparkles size={14} className="text-[var(--primary)]" />}
        tokensUsed={run.tokensUsed}
        durationMs={isTerminal ? run.durationMs : elapsed}
        onBack={onClose}
        actions={headerActions}
        extras={headerExtras}
        badgeExtras={<RunInterruptedBadge interrupted={run.interruptedByReboot} />}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'conversation' ? (
          <AgentActivityFeed
            turns={run.turns}
            liveEvents={liveEvents}
            liveScrollRef={liveScrollRef}
            isStreaming={isRunning}
          />
        ) : report ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-[900px]">
              <MarkdownViewer content={report.report} />
            </div>
          </div>
        ) : (
          <LoadingState>Report not yet produced</LoadingState>
        )}

        <RunErrorBanner message={run.error ?? handlerError} />
      </div>

      {(isWaiting || isRunning) && (
        <HumanInteractionPanel
          isWaiting={isWaiting}
          isRunning={isRunning}
          onSend={handleSend}
          placeholderRunning="Agent is analysing, message will queue…"
          placeholderIdle="Pivot the analysis (e.g. focus on cache compaction)…"
          waitingBanner="Agent is waiting for your input"
        />
      )}
    </div>
  );
}
