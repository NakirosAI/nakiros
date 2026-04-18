import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  UploadCloud,
  Wrench,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import type {
  AuditRun,
  AuditRunEvent,
  FixBenchmarks,
  FixBenchmarkSnapshot,
  SkillAgentTempFileEntry,
  SkillAgentTempFileContent,
} from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui';
import EvalRunsView from './EvalRunsView';
import { isImagePath } from '../utils/file-types';

interface Props {
  scope: 'project' | 'nakiros-bundled';
  projectId?: string;
  skillName: string;
  initialRun: AuditRun;
  /**
   * 'fix' (default): skill exists, temp copy, sync back to existing location.
   * 'create': skill does not exist yet, temp is empty, sync back creates the skill.
   * Only copy and confirm-button labels change — the runtime is identical.
   */
  mode?: 'fix' | 'create';
  onClose(): void;
}

type LiveEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'tool'; name: string; display: string; ts: number };

export default function FixView({ scope, projectId, skillName, initialRun, mode = 'fix', onClose }: Props) {
  const isCreate = mode === 'create';
  // Resolve the right IPC surface based on mode — the runtime is identical,
  // only the channel names and a few labels differ.
  const api = isCreate
    ? {
        getRun: window.nakiros.getCreateRun,
        sendUserMessage: window.nakiros.sendCreateUserMessage,
        finish: window.nakiros.finishCreate,
        stop: window.nakiros.stopCreate,
        getBufferedEvents: window.nakiros.getCreateBufferedEvents,
        onEvent: window.nakiros.onCreateEvent,
      }
    : {
        getRun: window.nakiros.getFixRun,
        sendUserMessage: window.nakiros.sendFixUserMessage,
        finish: window.nakiros.finishFix,
        stop: window.nakiros.stopFix,
        getBufferedEvents: window.nakiros.getFixBufferedEvents,
        onEvent: window.nakiros.onFixEvent,
      };
  const [run, setRun] = useState<AuditRun>(initialRun);
  const [userInput, setUserInput] = useState('');
  const [sending, setSending] = useState(false);
  // Elapsed time is anchored on the run's real start time, so resuming a run
  // that started 10 minutes ago doesn't reset the counter to zero.
  const startTime = useRef(new Date(initialRun.startedAt).getTime());
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - new Date(initialRun.startedAt).getTime()));
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const [benchmarks, setBenchmarks] = useState<FixBenchmarks | null>(null);
  const [evalsLoading, setEvalsLoading] = useState(false);
  const [evalsRunning, setEvalsRunning] = useState(false);
  /**
   * Once a fix-triggered eval batch is started we remember its run IDs so the
   * user can open the EvalRunsView overlay (and re-open it after closing it).
   * Null = no eval batch has been launched from this fix session yet.
   */
  const [evalSession, setEvalSession] = useState<{ runIds: string[]; iteration: number } | null>(null);
  const [evalsOpen, setEvalsOpen] = useState(false);

  // Poll the run state every 500ms
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const fresh = await api.getRun(initialRun.runId);
      if (mounted && fresh) setRun(fresh);
    }
    void refresh();
    const interval = setInterval(refresh, 500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [initialRun.runId]);

  // Replay any events the main process buffered for the current in-flight turn,
  // so the live stream is populated instead of starting empty when we resume.
  useEffect(() => {
    void api.getBufferedEvents(initialRun.runId).then((buffered) => {
      const now = Date.now();
      const replay: LiveEvent[] = [];
      for (const ev of buffered) {
        if (ev.type === 'text') replay.push({ type: 'text', text: ev.text, ts: now });
        else if (ev.type === 'tool') replay.push({ type: 'tool', name: ev.name, display: ev.display, ts: now });
      }
      if (replay.length > 0) setLiveEvents(replay);
    });
  }, [initialRun.runId]);

  // Subscribe to live events
  useEffect(() => {
    return api.onEvent((event: AuditRunEvent) => {
      if (event.runId !== initialRun.runId) return;

      if (event.event.type === 'text') {
        setLiveEvents((prev) => [...prev, { type: 'text', text: event.event.text, ts: Date.now() }]);
      } else if (event.event.type === 'tool') {
        setLiveEvents((prev) => [...prev, { type: 'tool', name: event.event.name, display: event.event.display, ts: Date.now() }]);
      } else if (event.event.type === 'status' && event.event.status === 'starting') {
        setLiveEvents([]);
      }
    });
  }, [initialRun.runId]);

  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveEvents]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startTime.current), 500);
    return () => clearInterval(t);
  }, []);

  const refreshBenchmarks = useCallback(async () => {
    if (isCreate) return; // No benchmarks exist while the skill is still being created
    try {
      const b = await window.nakiros.getFixBenchmarks(initialRun.runId);
      setBenchmarks(b);
    } catch {
      // Run may have terminated — just ignore
    }
  }, [initialRun.runId, isCreate]);

  useEffect(() => {
    void refreshBenchmarks();
  }, [refreshBenchmarks]);

  // Subscribe to eval events to refresh benchmarks when an in-temp run finishes.
  useEffect(() => {
    if (isCreate) return;
    return window.nakiros.onEvalEvent((event) => {
      if (event.event.type === 'done' || (event.event.type === 'status' && event.event.status === 'completed')) {
        void refreshBenchmarks();
        setEvalsRunning(false);
      }
    });
  }, [refreshBenchmarks, isCreate]);

  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';

  async function handleSend() {
    const trimmed = userInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.sendUserMessage(initialRun.runId, trimmed);
      setUserInput('');
    } catch (err) {
      alert(`Failed to send: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleSync() {
    if (sending) return;
    const prompt = isCreate
      ? `Create the skill "${skillName}" from the current temp workdir? This copies every file produced by the agent into the new skill directory.`
      : `Sync the current fix changes to the real skill "${skillName}"? This copies the temp workdir onto the real skill directory.`;
    if (!confirm(prompt)) return;
    setSending(true);
    try {
      await api.finish(initialRun.runId);
    } catch (err) {
      alert(`Failed to sync: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleDiscard() {
    if (!confirm(isCreate ? 'Discard this create session? The draft skill will be lost.' : 'Discard this fix session? All changes in the temp workdir will be lost.')) return;
    await api.stop(initialRun.runId);
  }

  async function handleRunEvalsInTemp() {
    if (evalsLoading || evalsRunning) return;
    setEvalsLoading(true);
    setEvalsRunning(true);
    try {
      const response = await window.nakiros.runFixEvalsInTemp({
        runId: initialRun.runId,
        includeBaseline: true,
      });
      setEvalSession({ runIds: response.runIds, iteration: response.iteration });
      // Auto-open the overlay so the user can see / interact with the runs
      // (interactive evals need human input between turns).
      setEvalsOpen(true);
    } catch (err) {
      setEvalsRunning(false);
      alert(`Failed to start evals: ${(err as Error).message}`);
    } finally {
      setEvalsLoading(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        {isCreate ? <Plus size={14} className="text-emerald-400" /> : <Wrench size={14} className="text-amber-400" />}
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {isCreate ? 'Create' : 'Fix'} — {skillName}
        </span>
        <StatusPill status={run.status} />

        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{formatTokens(run.tokensUsed)}</span>
          <span>·</span>
          <span>{formatDuration(isTerminal ? run.durationMs : elapsed)}</span>
          {isWaiting && !isCreate && (
            <button
              onClick={handleRunEvalsInTemp}
              disabled={evalsLoading || evalsRunning}
              className="ml-2 flex items-center gap-1 rounded bg-[var(--primary-soft)] px-2 py-1 text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]/80 disabled:opacity-50"
              title="Run the skill's evals against the in-progress fix copy"
            >
              {evalsRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {evalsRunning ? 'Evaluating…' : 'Run evals'}
            </button>
          )}
          {evalSession && !evalsOpen && (
            <button
              onClick={() => setEvalsOpen(true)}
              className="flex items-center gap-1 rounded bg-[var(--bg-card)] border border-[var(--line)] px-2 py-1 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-muted)]"
              title="Reopen the eval runs panel"
            >
              <Play size={12} />
              Open evals ({evalSession.runIds.length})
            </button>
          )}
          {(isWaiting || isRunning) && (
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/30"
              title="Abandon this fix session — discard all temp changes"
            >
              <Trash2 size={12} />
              Discard
            </button>
          )}
          {(isWaiting || isRunning) && (
            <button
              onClick={handleSync}
              disabled={sending}
              className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
              title={isCreate ? 'Create the skill — copy the temp workdir into the skill directory' : 'Sync the temp workdir back to the real skill directory'}
            >
              <UploadCloud size={12} />
              {isCreate ? 'Create skill' : 'Sync to skill'}
            </button>
          )}
        </div>
      </div>

      {/* Benchmark compare — fix-only (nothing to benchmark in a fresh create) */}
      {!isCreate && (
        <BenchmarkComparePanel
          benchmarks={benchmarks}
          evalsRunning={evalsRunning}
          onRefresh={refreshBenchmarks}
        />
      )}

      {/* Draft files — preview what's in the temp workdir before Sync/Create */}
      <DraftFilesPanel runId={initialRun.runId} defaultOpen={isCreate} />

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConversationPanel run={run} liveEvents={liveEvents} liveScrollRef={liveScrollRef} isStreaming={isRunning} />

        {run.error && (
          <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={12} />
              Error
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono">{run.error}</pre>
          </div>
        )}
      </div>

      {/* Interactive input panel — always visible while not terminal so the user can keep iterating */}
      {(isWaiting || isRunning) && (
        <div className="border-t border-[var(--line)] bg-[var(--bg-soft)] p-3">
          {isWaiting && (
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <MessageSquare size={12} />
              {isCreate
                ? 'Reply to the agent, then click "Create skill" when the draft is ready or "Discard" to abandon.'
                : 'Reply to iterate, Run evals to validate, then Sync to skill or Discard'}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend();
              }}
              placeholder={isRunning ? "Wait for the agent to finish the current turn..." : "Type your response... (⌘/Ctrl+Enter to send)"}
              disabled={isRunning}
              className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:opacity-50"
              autoFocus={isWaiting}
            />
            <button
              onClick={handleSend}
              disabled={!userInput.trim() || sending || isRunning}
              className="flex items-start gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
            >
              <Send size={12} />
              Send
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Evals overlay — sits above FixView (z-[400] > FixView's z-[300]).
        Closing it does NOT stop the runs; they keep streaming and we can reopen. */}
    {evalsOpen && evalSession && (
      <div className="fixed inset-0 z-[400] flex flex-col bg-[var(--bg-base)]">
        <EvalRunsView
          scope={scope}
          projectId={projectId}
          skillName={skillName}
          initialRunIds={evalSession.runIds}
          iteration={evalSession.iteration}
          onClose={() => setEvalsOpen(false)}
        />
      </div>
    )}
    </>
  );
}

function ConversationPanel({
  run,
  liveEvents,
  liveScrollRef,
  isStreaming,
}: {
  run: AuditRun;
  liveEvents: LiveEvent[];
  liveScrollRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-[900px] flex-col gap-3">
        {run.turns.map((turn, i) => (
          <TurnBubble key={i} turn={turn} />
        ))}

        {isStreaming && <LiveActivity events={liveEvents} scrollRef={liveScrollRef} />}
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

function LiveActivity({ events, scrollRef }: { events: LiveEvent[]; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="mr-12 rounded-lg border border-amber-400/30 bg-amber-500/5 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-amber-400">
        <Loader2 size={12} className="animate-spin" />
        <span className="font-semibold">Streaming…</span>
        <span className="text-[var(--text-muted)]">{events.length} events</span>
      </div>
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto rounded bg-[var(--bg-base)] p-2">
        {events.length === 0 ? (
          <span className="text-xs text-[var(--text-muted)]">Waiting for first chunk...</span>
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
        <span className="shrink-0 rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
          {event.name}
        </span>
        <span className="break-all text-[var(--text-primary)]">{event.display}</span>
      </div>
    );
  }
  return <div className="whitespace-pre-wrap text-[var(--text-muted)]">{event.text}</div>;
}

function StatusPill({ status }: { status: AuditRun['status'] }) {
  const conf =
    status === 'completed'
      ? { icon: <CheckCircle size={12} />, label: 'completed', className: 'bg-emerald-500/20 text-emerald-400' }
      : status === 'failed'
        ? { icon: <XCircle size={12} />, label: 'failed', className: 'bg-red-500/20 text-red-400' }
        : status === 'stopped'
          ? { icon: <Square size={12} />, label: 'stopped', className: 'bg-[var(--bg-muted)] text-[var(--text-muted)]' }
          : status === 'waiting_for_input'
            ? { icon: <MessageSquare size={12} />, label: 'waiting', className: 'bg-amber-500/20 text-amber-400' }
            : { icon: <Loader2 size={12} className="animate-spin" />, label: status, className: 'bg-[var(--primary-soft)] text-[var(--primary)]' };

  return (
    <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', conf.className)}>
      {conf.icon}
      {conf.label}
    </span>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  return `${(n / 1000).toFixed(1)}k tok`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m${sec}s`;
}

function BenchmarkComparePanel({
  benchmarks,
  evalsRunning,
  onRefresh,
}: {
  benchmarks: FixBenchmarks | null;
  evalsRunning: boolean;
  onRefresh(): void;
}) {
  if (!benchmarks || (!benchmarks.real && !benchmarks.temp)) return null;

  const realWith = benchmarks.real?.withSkill ?? null;
  const tempWith = benchmarks.temp?.withSkill ?? null;
  const hasBoth = realWith && tempWith;
  const delta = hasBoth ? tempWith.passRate - realWith.passRate : null;

  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
      <div className="mx-auto flex max-w-[900px] items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <CheckCircle size={12} />
          Benchmarks
        </div>
        <BenchmarkBlock label="Real skill" snapshot={benchmarks.real} />
        <span className="text-[var(--text-muted)]">→</span>
        <BenchmarkBlock label="In-progress fix" snapshot={benchmarks.temp} highlight />
        {delta !== null && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px] font-bold',
              delta > 0
                ? 'bg-emerald-500/20 text-emerald-400'
                : delta < 0
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-[var(--bg-muted)] text-[var(--text-muted)]',
            )}
            title="Delta pass-rate (temp vs real)"
          >
            {delta > 0 ? '+' : ''}
            {(delta * 100).toFixed(1)}%
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={evalsRunning}
          className="ml-auto flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg-card)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          title="Refresh benchmarks"
        >
          <RefreshCw size={10} className={evalsRunning ? 'animate-spin' : ''} />
          {evalsRunning ? 'Running…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}

function BenchmarkBlock({
  label,
  snapshot,
  highlight,
}: {
  label: string;
  snapshot: FixBenchmarkSnapshot | null;
  highlight?: boolean;
}) {
  if (!snapshot) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
        <span className="text-xs text-[var(--text-muted)]">—</span>
      </div>
    );
  }
  const pct = (snapshot.withSkill.passRate * 100).toFixed(0);
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label} · iter {snapshot.iteration}
      </span>
      <span className={clsx('text-xs font-semibold', highlight ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]')}>
        {pct}% ({snapshot.withSkill.passedAssertions}/{snapshot.withSkill.totalAssertions})
      </span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Collapsible panel listing every file in the temp workdir with a preview viewer.
 * The user needs this to review what the agent produced before clicking
 * "Create skill" / "Sync to skill" — otherwise they're agreeing blind.
 */
function DraftFilesPanel({ runId, defaultOpen }: { runId: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [entries, setEntries] = useState<SkillAgentTempFileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<SkillAgentTempFileContent | null>(null);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const list = await window.nakiros.listSkillAgentTempFiles(runId);
      setError(null);
      setEntries(list);
      // Auto-select SKILL.md if present (most relevant for create/fix review)
      if (list.length > 0) {
        setSelected((prev) => {
          if (prev && list.some((e) => e.relativePath === prev)) return prev;
          const skillMd = list.find((e) => e.relativePath === 'SKILL.md');
          return (skillMd ?? list[0]).relativePath;
        });
      } else {
        setSelected(null);
      }
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error('[DraftFilesPanel] listSkillAgentTempFiles failed:', msg);
      setError(msg);
    }
  }, [runId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const interval = setInterval(refresh, 3000); // Poll while the agent is editing
    return () => clearInterval(interval);
  }, [open, refresh]);

  useEffect(() => {
    if (!selected || !open) {
      setContent(null);
      return;
    }
    setLoading(true);
    window.nakiros
      .readSkillAgentTempFile(runId, selected)
      .then((c) => setContent(c))
      .catch(() => setContent({ kind: 'missing' }))
      .finally(() => setLoading(false));
  }, [runId, selected, open]);

  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <FileText size={12} />
        <span className="font-semibold">Draft files ({entries.length})</span>
        <span className="text-[var(--text-muted)]">— click to {open ? 'hide' : 'preview what will be written'}</span>
        <span className="ml-auto text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex border-t border-[var(--line)]" style={{ height: 320 }}>
          {/* File list */}
          <div className="w-[240px] shrink-0 overflow-y-auto border-r border-[var(--line)]">
            {error ? (
              <div className="p-3 text-xs text-red-400">
                <div className="font-semibold">IPC error</div>
                <div className="mt-1 break-all font-mono">{error}</div>
                <div className="mt-2 text-[var(--text-muted)]">
                  The main process likely needs a restart — quit and relaunch the app.
                </div>
              </div>
            ) : entries.length === 0 ? (
              <div className="p-3 text-xs text-[var(--text-muted)]">
                No files written yet. Poll refreshes every 3s while the panel is open.
              </div>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.relativePath}
                  onClick={() => setSelected(entry.relativePath)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs',
                    selected === entry.relativePath
                      ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-muted)]',
                  )}
                  title={entry.relativePath}
                >
                  <span className="truncate">{entry.relativePath}</span>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{formatBytes(entry.sizeBytes)}</span>
                </button>
              ))
            )}
          </div>

          {/* Viewer */}
          <div className="min-w-0 flex-1 overflow-y-auto p-3">
            {!selected && <div className="text-xs text-[var(--text-muted)]">Select a file.</div>}
            {selected && loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Loader2 size={12} className="animate-spin" />
                Loading…
              </div>
            )}
            {selected && !loading && content && content.kind === 'missing' && (
              <div className="text-xs text-[var(--text-muted)]">
                File no longer exists. The agent may have moved or deleted it.
              </div>
            )}
            {selected && !loading && content && content.kind === 'image' && (
              <div className="flex items-center justify-center">
                <img src={content.dataUrl} alt={selected} className="max-h-full max-w-full object-contain" />
              </div>
            )}
            {selected && !loading && content && content.kind === 'binary' && (
              <div className="text-xs text-[var(--text-muted)]">
                Binary file ({formatBytes(content.sizeBytes)}). Preview disabled.
              </div>
            )}
            {selected && !loading && content && content.kind === 'text' && (
              isImagePath(selected) ? (
                <pre className="whitespace-pre-wrap break-all text-xs text-[var(--text-primary)]">{content.content}</pre>
              ) : selected.endsWith('.md') ? (
                <MarkdownViewer content={content.content} className="px-0 py-0" />
              ) : (
                <pre className="whitespace-pre-wrap break-all text-xs text-[var(--text-primary)]">{content.content}</pre>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
