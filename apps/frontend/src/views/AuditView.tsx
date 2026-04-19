import { useEffect, useRef, useState } from 'react';
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
import type { AuditRun, AuditRunEvent } from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui';

interface Props {
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
  projectId?: string;
  skillName: string;
  initialRun: AuditRun;
  onClose(): void;
}

type Tab = 'conversation' | 'report';

type LiveEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'tool'; name: string; display: string; ts: number };

export default function AuditView({ scope, projectId, skillName, initialRun, onClose }: Props) {
  const { t } = useTranslation('audit');
  const [run, setRun] = useState<AuditRun>(initialRun);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');
  const [userInput, setUserInput] = useState('');
  const [sending, setSending] = useState(false);
  // Anchor elapsed on the run's real start time so re-opening mid-run doesn't
  // reset the counter to zero.
  const startTime = useRef(new Date(initialRun.startedAt).getTime());
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - new Date(initialRun.startedAt).getTime()));
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const liveScrollRef = useRef<HTMLDivElement>(null);

  // Poll the run state every 500ms (in addition to event stream)
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const fresh = await window.nakiros.getAuditRun(initialRun.runId);
      if (mounted && fresh) setRun(fresh);
    }
    void refresh();
    const interval = setInterval(refresh, 500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [initialRun.runId]);

  // Replay any events the daemon buffered for the in-flight turn so the stream
  // is populated instead of starting empty when remounting mid-turn.
  useEffect(() => {
    void window.nakiros.getAuditBufferedEvents(initialRun.runId).then((buffered) => {
      const now = Date.now();
      const replay: LiveEvent[] = [];
      for (const ev of buffered) {
        if (ev.type === 'text') replay.push({ type: 'text', text: ev.text, ts: now });
        else if (ev.type === 'tool') replay.push({ type: 'tool', name: ev.name, display: ev.display, ts: now });
      }
      if (replay.length > 0) setLiveEvents(replay);
    });
  }, [initialRun.runId]);

  // Subscribe to live events: capture text/tool for the live activity panel
  useEffect(() => {
    return window.nakiros.onAuditEvent((event: AuditRunEvent) => {
      if (event.runId !== initialRun.runId) return;
      const inner = event.event;
      if (inner.type === 'text') {
        setLiveEvents((prev) => [...prev, { type: 'text', text: inner.text, ts: Date.now() }]);
      } else if (inner.type === 'tool') {
        setLiveEvents((prev) => [...prev, { type: 'tool', name: inner.name, display: inner.display, ts: Date.now() }]);
      } else if (inner.type === 'status') {
        // Reset the live stream when a fresh turn starts (the previous turn is now in run.turns)
        if (inner.status === 'starting') {
          setLiveEvents([]);
        }
        // Reflect status changes immediately rather than waiting for the next
        // poll — critical for Stop feedback, also correct for all other transitions.
        setRun((prev) => ({ ...prev, status: inner.status }));
      } else if (inner.type === 'done' && inner.reportPath) {
        void window.nakiros.readAuditReport(inner.reportPath).then((content) => {
          if (content !== null) setReportContent(content);
        });
        setTab('report');
      }
    });
  }, [initialRun.runId]);

  // Auto-scroll live activity panel to bottom on new events
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveEvents]);

  // When run completes, fetch the report
  useEffect(() => {
    if (run.status === 'completed' && run.reportPath && !reportContent) {
      void window.nakiros.readAuditReport(run.reportPath).then((content) => {
        if (content !== null) setReportContent(content);
      });
    }
  }, [run.status, run.reportPath, reportContent]);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startTime.current), 500);
    return () => clearInterval(t);
  }, []);

  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';

  async function handleSend() {
    const trimmed = userInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await window.nakiros.sendAuditUserMessage(initialRun.runId, trimmed);
      setUserInput('');
    } catch (err) {
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
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend();
              }}
              placeholder={t('input.placeholder')}
              className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!userInput.trim() || sending}
              className="flex items-start gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
            >
              <Send size={12} />
              {t('input.send')}
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
  // The last turn in run.turns is the user message of the current in-progress turn (if streaming).
  // Show it followed by the live event panel that aggregates streaming text + tool calls.
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-[900px] flex-col gap-3">
        {run.turns.map((turn, i) => (
          <TurnBubble key={i} turn={turn} />
        ))}

        {isStreaming && (
          <LiveActivity events={liveEvents} scrollRef={liveScrollRef} t={t} />
        )}
      </div>
    </div>
  );
}

function TurnBubble({ turn }: { turn: AuditRun['turns'][number] }) {
  return (
    <div
      className={clsx(
        'rounded-lg px-4 py-3',
        turn.role === 'user'
          ? 'ml-12 bg-[var(--primary-soft)]'
          : 'mr-12 border border-[var(--line)] bg-[var(--bg-card)]',
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="font-semibold capitalize">{turn.role}</span>
        <span>{new Date(turn.timestamp).toLocaleTimeString()}</span>
      </div>
      {turn.role === 'assistant' ? (
        <MarkdownViewer content={turn.content} className="px-0 py-0" />
      ) : (
        <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{turn.content}</div>
      )}
      {turn.tools && turn.tools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {turn.tools.map((tool, j) => (
            <span
              key={j}
              title={tool.display}
              className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
            >
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveActivity({
  events,
  scrollRef,
  t,
}: {
  events: LiveEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  t: TFunction<'audit'>;
}) {
  return (
    <div className="mr-12 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary-soft)]/30 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--primary)]">
        <Loader2 size={12} className="animate-spin" />
        <span className="font-semibold">{t('live.streaming')}</span>
        <span className="text-[var(--text-muted)]">{t('live.events', { count: events.length })}</span>
      </div>
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto rounded bg-[var(--bg)] p-2">
        {events.length === 0 ? (
          <span className="text-xs text-[var(--text-muted)]">{t('live.waitingFirstChunk')}</span>
        ) : (
          <div className="flex flex-col gap-1.5 font-mono text-xs">
            {events.map((event, i) => (
              <LiveEventLine key={i} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveEventLine({ event }: { event: LiveEvent }) {
  if (event.type === 'tool') {
    return (
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--primary)]">
          {event.name}
        </span>
        <span className="break-all text-[var(--text-primary)]">{event.display}</span>
      </div>
    );
  }
  // text event
  return (
    <div className="whitespace-pre-wrap text-[var(--text-muted)]">
      {event.text}
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

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick(): void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        active
          ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
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
