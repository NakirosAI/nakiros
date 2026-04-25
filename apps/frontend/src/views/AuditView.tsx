import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Square,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AuditRun, AuditRunEvent, SkillScope } from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui';
import {
  ConversationTurn,
  liveEventsToBlocks,
  legacyTurnToBlocks,
  endsOnAssistant,
  type LiveStreamEvent,
} from '../components/ConversationTurn';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { useRunState } from '../hooks/useRunState';
import { TabButton } from './skills/components';

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

type LiveEvent = LiveStreamEvent;

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
 */
export default function AuditView({ scope, projectId, skillName, initialRun, onClose }: Props) {
  const { t } = useTranslation('audit');
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');
  const [userInput, setUserInput] = useState('');
  const [sending, setSending] = useState(false);

  const { run, liveEvents, liveScrollRef } = useRunState<AuditRun, AuditRunEvent['event']>(
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

  // When run completes, fetch the report
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

  async function handleSend() {
    const trimmed = userInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setUserInput('');
    try {
      await window.nakiros.sendAuditUserMessage(initialRun.runId, trimmed);
    } catch (err) {
      setUserInput(trimmed);
      alert(t('input.sendFailed', { message: (err as Error).message }));
    } finally {
      setSending(false);
    }
  }

  async function handleStop() {
    await window.nakiros.stopAudit(initialRun.runId);
  }

  /**
   * User is satisfied with the archived audit report — discard the in-memory
   * run + workdir (conversation + events) so the skill can be audited fresh
   * next time. The report file in `{skill}/audits/` is kept.
   */
  async function handleFinish() {
    await window.nakiros.finishAudit(initialRun.runId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} />
          {t('header.back')}
        </button>
        <Sparkles size={14} className="text-[var(--primary)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {t('header.title', { skillName })}
        </span>
        <StatusPill status={run.status} t={t} />

        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{formatTokens(run.tokensUsed, t)}</span>
          <span>·</span>
          <span>{formatDuration(isTerminal ? run.durationMs : elapsed, t)}</span>
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
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'conversation' ? (
          <ConversationPanel
            run={run}
            liveEvents={liveEvents}
            liveScrollRef={liveScrollRef}
            isStreaming={isRunning}
            t={t}
          />
        ) : reportContent ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-[900px]">
              <MarkdownViewer content={reportContent} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
            {t('report.notYetProduced')}
          </div>
        )}

        {run.error && (
          <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={12} />
              {t('error.title')}
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono">{run.error}</pre>
          </div>
        )}
      </div>

      {/* Interactive input panel */}
      {isWaiting && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">
            <MessageSquare size={12} />
            {t('input.waitingForInput')}
          </div>
          <div className="flex gap-2">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t('input.placeholder')}
              className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!userInput.trim() || sending}
              aria-label={t('input.send')}
              title={t('input.send')}
              className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] p-2.5 text-white transition-colors hover:bg-[var(--primary)]/90 disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationPanel({
  run,
  liveEvents,
  liveScrollRef,
  isStreaming,
  t,
}: {
  run: AuditRun;
  liveEvents: LiveEvent[];
  liveScrollRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  t: TFunction<'audit'>;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-[900px] flex-col gap-3">
        {run.turns.map((turn, i) => (
          <ConversationTurn
            key={i}
            role={turn.role}
            timestamp={turn.timestamp}
            blocks={
              turn.blocks ??
              (turn.role === 'assistant'
                ? legacyTurnToBlocks(turn.content, turn.tools)
                : [{ type: 'text', text: turn.content }])
            }
          />
        ))}

        {isStreaming &&
          liveEvents.length > 0 &&
          !endsOnAssistant(run.turns) && (
            <ConversationTurn
              role="assistant"
              timestamp={new Date().toISOString()}
              blocks={liveEventsToBlocks(liveEvents)}
              streaming
              scrollRef={liveScrollRef}
            />
          )}

        {isStreaming && liveEvents.length === 0 && !endsOnAssistant(run.turns) && (
          <ThinkingIndicator
            verbs={t('thinking.verbs', { returnObjects: true }) as string[]}
          />
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, t }: { status: AuditRun['status']; t: TFunction<'audit'> }) {
  const conf =
    status === 'completed'
      ? { icon: <CheckCircle size={12} />, label: t('status.completed'), className: 'bg-emerald-500/20 text-emerald-400' }
      : status === 'failed'
        ? { icon: <XCircle size={12} />, label: t('status.failed'), className: 'bg-red-500/20 text-red-400' }
        : status === 'stopped'
          ? { icon: <Square size={12} />, label: t('status.stopped'), className: 'bg-[var(--bg-muted)] text-[var(--text-muted)]' }
          : status === 'waiting_for_input'
            ? { icon: <MessageSquare size={12} />, label: t('status.waiting'), className: 'bg-amber-500/20 text-amber-400' }
            : { icon: <Loader2 size={12} className="animate-spin" />, label: t(`status.${status}` as 'status.running' | 'status.starting'), className: 'bg-[var(--primary-soft)] text-[var(--primary)]' };

  return (
    <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', conf.className)}>
      {conf.icon}
      {conf.label}
    </span>
  );
}

function formatTokens(n: number, t: TFunction<'audit'>): string {
  if (n < 1000) return t('tokens.short', { count: n });
  return t('tokens.thousands', { value: (n / 1000).toFixed(1) });
}

function formatDuration(ms: number, t: TFunction<'audit'>): string {
  if (ms < 1000) return t('duration.ms', { ms });
  if (ms < 60000) return t('duration.seconds', { s: (ms / 1000).toFixed(1) });
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return t('duration.minutes', { m: min, s: sec });
}
