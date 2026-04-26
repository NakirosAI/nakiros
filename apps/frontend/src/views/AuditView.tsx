import { useEffect, useState } from 'react';
import {
  CheckCircle,
  FileText,
  MessageSquare,
  RotateCw,
  Sparkles,
  Square,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditRun, AuditRunEvent, SkillScope } from '@nakiros/shared';
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
  /** Skill scope (project / claude-global / nakiros-bundled / plugin). */
  scope: SkillScope;
  /** Project id when `scope === 'project'`. */
  projectId?: string;
  /** Plugin name when `scope === 'plugin'`. */
  pluginName?: string;
  /** Marketplace name when `scope === 'plugin'`. */
  marketplaceName?: string;
  /** Skill folder name being audited. */
  skillName: string;
  /** Run snapshot returned by `startAudit` — already attached to the bus. */
  initialRun: AuditRun;
  /** Closes the overlay; the parent typically refreshes the skills list. */
  onClose(): void;
}

type Tab = 'conversation' | 'report';

const AUDIT_RUN_API = {
  getRun: (id: string) => window.nakiros.getAuditRun(id),
  getBufferedEvents: (id: string) => window.nakiros.getAuditBufferedEvents(id),
  onEvent: window.nakiros.onAuditEvent,
};

/**
 * Full-screen overlay rendering an in-flight or terminal audit run.
 *
 * Subscribes to the audit run via `useRunState` (poll + IPC events through
 * `window.nakiros.getAuditRun` / `getAuditBufferedEvents` / `onAuditEvent`),
 * displays the streaming Claude conversation, and once `done` lands, fetches
 * the markdown report from disk via `readAuditReport`. Lets the user reply
 * while the run is `waiting_for_input`, stop a running audit, or finish a
 * completed one (which discards the in-memory workdir but keeps the report
 * file on disk). Mounted from the various `*SkillsView` components when
 * `s.activeAudit` is set.
 *
 * Composes the shared run library: {@link RunControlHeader},
 * {@link AgentActivityFeed}, {@link HumanInteractionPanel} and
 * {@link RunErrorBanner} — the report tab is the only audit-specific slot.
 */
export default function AuditView({ skillName, initialRun, onClose }: Props) {
  const { t } = useTranslation('audit');
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');

  const { run, liveEvents, liveScrollRef, handlerError } = useRunState<AuditRun, AuditRunEvent['event']>(
    initialRun.runId,
    initialRun,
    AUDIT_RUN_API,
    (inner) => {
      if (inner.type === 'done' && inner.reportPath) {
        void window.nakiros.readAuditReport(inner.reportPath).then((content) => {
          if (content !== null) setReportContent(content);
        });
        setTab('report');
      }
    },
  );
  const elapsed = useElapsedTimer(initialRun.startedAt);

  useEffect(() => {
    if (run.status === 'completed' && run.reportPath && !reportContent) {
      void window.nakiros.readAuditReport(run.reportPath).then((content) => {
        if (content !== null) setReportContent(content);
      });
    }
  }, [run.status, run.reportPath, reportContent]);

  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';

  async function handleSend(message: string) {
    await window.nakiros.sendAuditUserMessage(initialRun.runId, message);
  }

  async function handleStop() {
    await window.nakiros.stopAudit(initialRun.runId);
  }

  /**
   * Resume an audit run that was rehydrated `waiting_for_input` after a
   * daemon reboot. Sends a synthetic continuation prompt to the agent via
   * `--resume`. The factory clears `interruptedByReboot` once the next turn
   * starts, so the badge disappears automatically.
   */
  async function handleResume() {
    await window.nakiros.sendAuditUserMessage(initialRun.runId, RESUME_PROMPTS.audit);
  }

  /**
   * User is satisfied with the archived audit report — discard the in-memory
   * run + workdir (conversation + events) so the skill can be audited fresh
   * next time. The report file in `{skill}/audits/` is kept.
   */
  async function handleFinish() {
    await window.nakiros.finishAudit(initialRun.runId);
    agentRunStore.dismiss(initialRun.runId);
    onClose();
  }

  const { t: tRuns } = useTranslation('runs');
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
          {t('header.stop')}
        </button>
      )}
      {run.status === 'completed' && (
        <button
          onClick={handleFinish}
          className="ml-2 flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 transition-colors hover:bg-emerald-500/30"
        >
          <CheckCircle size={12} />
          {t('header.finish')}
        </button>
      )}
    </>
  );

  const headerExtras = (
    <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
      <TabButton active={tab === 'conversation'} onClick={() => setTab('conversation')}>
        <MessageSquare size={12} />
        {t('tabs.conversation')}
      </TabButton>
      <TabButton
        active={tab === 'report'}
        onClick={() => setTab('report')}
        disabled={!reportContent}
      >
        <FileText size={12} />
        {reportContent ? t('tabs.report') : t('tabs.reportPending')}
      </TabButton>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg)]">
      <RunControlHeader
        status={run.status}
        title={t('header.title', { skillName })}
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
            thinkingVerbs={t('thinking.verbs', { returnObjects: true }) as string[]}
          />
        ) : reportContent ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-[900px]">
              <MarkdownViewer content={reportContent} />
            </div>
          </div>
        ) : (
          <LoadingState>{t('report.notYetProduced')}</LoadingState>
        )}

        <RunErrorBanner message={run.error ?? handlerError} />
      </div>

      {isWaiting && <HumanInteractionPanel isWaiting onSend={handleSend} />}
    </div>
  );
}
