import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  FileText,
  Flag,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Square,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { MarkdownViewer } from '../components/ui';
import type { SkillEvalRun, EvalRunEvent, EvalRunStatus, EvalRunOutputEntry } from '@nakiros/shared';

interface Props {
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
  projectId?: string;
  skillName: string;
  initialRunIds: string[];
  iteration: number;
  onClose(): void;
}

type LiveEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'tool'; name: string; display: string; ts: number };

export default function EvalRunsView({ scope, projectId, skillName, initialRunIds, iteration, onClose }: Props) {
  const [runs, setRuns] = useState<Map<string, SkillEvalRun>>(new Map());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunIds[0] ?? null);
  const [liveEventsByRun, setLiveEventsByRun] = useState<Map<string, LiveEvent[]>>(new Map());
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  // Load feedback for this iteration
  useEffect(() => {
    void window.nakiros.getEvalFeedback({ scope, projectId, skillName, iteration }).then(setFeedback);
  }, [scope, projectId, skillName, iteration]);

  async function saveFeedback(evalName: string, text: string) {
    setFeedback((prev) => ({ ...prev, [evalName]: text }));
    await window.nakiros.saveEvalFeedback({ scope, projectId, skillName, iteration, evalName, feedback: text });
  }

  // Poll runs every 500ms while any run is not terminal, in addition to listening for events
  useEffect(() => {
    let mounted = true;

    async function refresh() {
      const all = await window.nakiros.listEvalRuns();
      if (!mounted) return;
      const filtered = all.filter((r) => initialRunIds.includes(r.runId));
      setRuns(new Map(filtered.map((r) => [r.runId, r])));
    }

    void refresh();
    const interval = setInterval(refresh, 500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [initialRunIds]);

  // Subscribe to event stream — capture text + tool events for the live activity panel
  useEffect(() => {
    const unsubscribe = window.nakiros.onEvalEvent((event: EvalRunEvent) => {
      if (!initialRunIds.includes(event.runId)) return;

      if (event.event.type === 'text') {
        const e: LiveEvent = { type: 'text', text: event.event.text, ts: Date.now() };
        setLiveEventsByRun((prev) => {
          const next = new Map(prev);
          next.set(event.runId, [...(next.get(event.runId) ?? []), e]);
          return next;
        });
      } else if (event.event.type === 'tool') {
        const e: LiveEvent = { type: 'tool', name: event.event.name, display: event.event.display, ts: Date.now() };
        setLiveEventsByRun((prev) => {
          const next = new Map(prev);
          next.set(event.runId, [...(next.get(event.runId) ?? []), e]);
          return next;
        });
      } else if (event.event.type === 'status' && event.event.status === 'starting') {
        // Reset live events when a fresh turn starts
        setLiveEventsByRun((prev) => {
          const next = new Map(prev);
          next.set(event.runId, []);
          return next;
        });
      }
    });
    return unsubscribe;
  }, [initialRunIds]);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startTime.current), 500);
    return () => clearInterval(t);
  }, []);

  const runsList = useMemo(
    () => initialRunIds.map((id) => runs.get(id)).filter((r): r is SkillEvalRun => Boolean(r)),
    [runs, initialRunIds],
  );

  // Group runs by eval name (one row = one eval with its with/without pair)
  const groupedByEval = useMemo(() => {
    const map = new Map<string, { withSkill?: SkillEvalRun; withoutSkill?: SkillEvalRun }>();
    for (const run of runsList) {
      const entry = map.get(run.evalName) ?? {};
      if (run.config === 'with_skill') entry.withSkill = run;
      else entry.withoutSkill = run;
      map.set(run.evalName, entry);
    }
    return map;
  }, [runsList]);

  const terminalStatuses: EvalRunStatus[] = ['completed', 'failed', 'stopped'];
  const runningStatuses: EvalRunStatus[] = ['starting', 'running', 'grading'];
  const completed = runsList.filter((r) => terminalStatuses.includes(r.status)).length;
  const running = runsList.filter((r) => runningStatuses.includes(r.status)).length;
  const totalTokens = runsList.reduce((sum, r) => sum + r.tokensUsed, 0);
  const allDone = runsList.length > 0 && runsList.every((r) => terminalStatuses.includes(r.status));

  const selected = selectedRunId ? runs.get(selectedRunId) : null;

  async function handleStop(runId: string) {
    await window.nakiros.stopEvalRun(runId);
  }

  async function handleStopAll() {
    for (const run of runsList) {
      if (!terminalStatuses.includes(run.status)) {
        await window.nakiros.stopEvalRun(run.runId);
      }
    }
  }

  return (
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
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Eval Runs — {skillName} · Iteration {iteration}
        </span>
        <div className="ml-auto flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>
            {completed}/{runsList.length} complete
          </span>
          {running > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--primary)]">{running} running</span>
            </>
          )}
          <span>·</span>
          <span>{formatDuration(elapsed)} elapsed</span>
          <span>·</span>
          <span>{formatTokens(totalTokens)} used</span>
          {!allDone && (
            <button
              onClick={handleStopAll}
              className="ml-2 flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/30"
            >
              <Square size={12} />
              Stop all
            </button>
          )}
        </div>
      </div>

      {/* Body: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Runs list — grouped by eval with with/without pair */}
        <div className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-soft)]">
          {Array.from(groupedByEval.entries()).map(([evalName, pair]) => (
            <div key={evalName} className="border-b border-[var(--line)]">
              <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold text-[var(--text-primary)]">
                {evalName}
                {feedback[evalName] && (
                  <span title={feedback[evalName]} className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-400">
                    💬
                  </span>
                )}
              </div>
              {pair.withSkill && (
                <RunListItem
                  run={pair.withSkill}
                  label="with skill"
                  selected={selectedRunId === pair.withSkill.runId}
                  onClick={() => setSelectedRunId(pair.withSkill!.runId)}
                />
              )}
              {pair.withoutSkill && (
                <RunListItem
                  run={pair.withoutSkill}
                  label="without (baseline)"
                  selected={selectedRunId === pair.withoutSkill.runId}
                  onClick={() => setSelectedRunId(pair.withoutSkill!.runId)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selected ? (
            <RunDetail
              run={selected}
              liveEvents={liveEventsByRun.get(selected.runId) ?? []}
              onStop={handleStop}
              feedback={feedback[selected.evalName] ?? ''}
              onSaveFeedback={(text) => saveFeedback(selected.evalName, text)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
              Select a run
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RunListItem({
  run,
  label,
  selected,
  onClick,
}: {
  run: SkillEvalRun;
  label: string;
  selected: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
        selected ? 'bg-[var(--bg-muted)]' : 'hover:bg-[var(--bg-muted)]/50',
      )}
    >
      <StatusIcon status={run.status} />
      <span className={clsx('shrink-0', run.config === 'with_skill' ? 'text-[var(--primary)]' : 'text-amber-400')}>
        {label}
      </span>
      <span className="ml-auto truncate text-[10px] text-[var(--text-muted)]">
        {run.tokensUsed > 0 && formatTokens(run.tokensUsed)}
        {run.durationMs > 0 && ` · ${formatDuration(run.durationMs)}`}
      </span>
    </button>
  );
}

function RunDetail({
  run,
  liveEvents,
  onStop,
  feedback,
  onSaveFeedback,
}: {
  run: SkillEvalRun;
  liveEvents: LiveEvent[];
  onStop(runId: string): void;
  feedback: string;
  onSaveFeedback(text: string): void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState<'turns' | 'stream' | null>('turns');
  const [userInput, setUserInput] = useState('');
  const [sending, setSending] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState(feedback);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const liveScrollRef = useRef<HTMLDivElement>(null);

  // Keep draft in sync when switching runs (different evalName → different feedback)
  useEffect(() => {
    setFeedbackDraft(feedback);
  }, [feedback, run.evalName]);

  // Auto-scroll the live activity panel
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveEvents]);

  const isRunning = run.status === 'running' || run.status === 'starting' || run.status === 'grading';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';
  const isWaiting = run.status === 'waiting_for_input';
  const feedbackDirty = feedbackDraft !== feedback;

  async function handleSend() {
    const trimmed = userInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await window.nakiros.sendEvalUserMessage(run.runId, trimmed);
      setUserInput('');
    } catch (err) {
      alert(`Failed to send: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleFinish() {
    if (sending) return;
    setSending(true);
    try {
      await window.nakiros.finishEvalRun(run.runId);
    } catch (err) {
      alert(`Failed to finish: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleSaveFeedback() {
    if (!feedbackDirty || feedbackSaving) return;
    setFeedbackSaving(true);
    try {
      await onSaveFeedback(feedbackDraft);
    } finally {
      setFeedbackSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <StatusIcon status={run.status} size="lg" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{run.evalName}</div>
          <div className="flex gap-2 text-xs text-[var(--text-muted)]">
            <span>{run.config === 'with_skill' ? 'With skill' : 'Without skill (baseline)'}</span>
            <span>·</span>
            <span>{run.status}</span>
            {run.tokensUsed > 0 && (
              <>
                <span>·</span>
                <span>{formatTokens(run.tokensUsed)}</span>
              </>
            )}
            {run.durationMs > 0 && (
              <>
                <span>·</span>
                <span>{formatDuration(run.durationMs)}</span>
              </>
            )}
          </div>
        </div>
        {isRunning && (
          <button
            onClick={() => onStop(run.runId)}
            className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/30"
          >
            <Square size={12} />
            Stop
          </button>
        )}
      </div>

      {run.error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={12} />
            Error
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono">{run.error}</pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* Prompt */}
        <Section
          title="Prompt"
          expanded={expanded === 'turns'}
          onToggle={() => setExpanded(expanded === 'turns' ? null : 'turns')}
        >
          <pre className="whitespace-pre-wrap rounded bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-primary)]">
            {run.prompt}
          </pre>
        </Section>

        {/* Turns */}
        {run.turns.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {run.turns.map((turn, i) => (
              <div
                key={i}
                className={clsx(
                  'rounded-lg px-4 py-3',
                  turn.role === 'user'
                    ? 'ml-8 bg-[var(--primary-soft)]'
                    : 'mr-8 border border-[var(--line)] bg-[var(--bg-card)]',
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
                        className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                        title={tool.display}
                      >
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live activity panel — text + tool calls as they stream in */}
        {isRunning && (
          <div className="mt-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary-soft)]/30 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--primary)]">
              <Loader2 size={12} className="animate-spin" />
              <span className="font-semibold">Streaming…</span>
              <span className="text-[var(--text-muted)]">{liveEvents.length} events</span>
            </div>
            <div ref={liveScrollRef} className="max-h-[400px] overflow-y-auto rounded bg-[var(--bg-base)] p-2">
              {liveEvents.length === 0 ? (
                <span className="text-xs text-[var(--text-muted)]">Waiting for first chunk...</span>
              ) : (
                <div className="flex flex-col gap-1.5 font-mono text-xs">
                  {liveEvents.map((event, i) => (
                    <LiveEventLine key={i} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {isTerminal && <GeneratedOutputsPanel runId={run.runId} status={run.status} />}

        {/* Human feedback panel — visible once a run is terminal (not while running) */}
        {isTerminal && (
          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={12} className="text-[var(--text-muted)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">Your feedback</span>
                {!feedback && !feedbackDirty && (
                  <span className="text-[10px] text-[var(--text-muted)]">— empty means "passed review"</span>
                )}
                {feedback && !feedbackDirty && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">saved</span>
                )}
              </div>
              <button
                onClick={handleSaveFeedback}
                disabled={!feedbackDirty || feedbackSaving}
                className="rounded bg-[var(--primary)] px-2 py-1 text-[10px] font-medium text-white transition-colors disabled:opacity-50"
              >
                {feedbackSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder="What did you notice about this output? Be specific — actionable comments help fix the skill."
              className="min-h-[80px] w-full resize-y rounded border border-[var(--line)] bg-[var(--bg-base)] p-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        )}
      </div>

      {/* Interactive input panel */}
      {isWaiting && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">
            <MessageSquare size={12} />
            Agent is waiting for your input
          </div>
          <div className="flex gap-2">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  void handleSend();
                }
              }}
              placeholder="Type your response... (⌘/Ctrl+Enter to send)"
              className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSend}
                disabled={!userInput.trim() || sending}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
              >
                <Send size={12} />
                Send
              </button>
              <button
                onClick={handleFinish}
                disabled={sending}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
                title="Finish the run without answering (useful for 'should NOT do X' assertions)"
              >
                <Flag size={12} />
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  expanded: boolean;
  onToggle(): void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[var(--text-primary)]"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {expanded && <div className="border-t border-[var(--line)] p-3">{children}</div>}
    </div>
  );
}

function StatusIcon({ status, size = 'sm' }: { status: EvalRunStatus; size?: 'sm' | 'lg' }) {
  const sz = size === 'lg' ? 18 : 14;
  switch (status) {
    case 'completed':
      return <CheckCircle size={sz} className="text-emerald-400" />;
    case 'failed':
      return <XCircle size={sz} className="text-red-400" />;
    case 'stopped':
      return <Square size={sz} className="text-[var(--text-muted)]" />;
    case 'waiting_for_input':
      return <MessageSquare size={sz} className="text-amber-400" />;
    case 'running':
    case 'starting':
    case 'grading':
      return <Loader2 size={sz} className="animate-spin text-[var(--primary)]" />;
    case 'queued':
    default:
      return <span className="inline-block h-3 w-3 rounded-full border border-[var(--line-strong)]" />;
  }
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
  return <div className="whitespace-pre-wrap text-[var(--text-muted)]">{event.text}</div>;
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isRenderableAsText(relativePath: string): boolean {
  return /\.(md|txt|json|ya?ml|js|ts|tsx|jsx|html|css|sh|py|rs|go|toml)$/i.test(relativePath);
}

function isMarkdown(relativePath: string): boolean {
  return /\.md$/i.test(relativePath);
}

/**
 * Shows the files the agent generated under `{workdir}/outputs/`.
 * Without this panel the human reviewer can't actually see what the agent produced,
 * which is exactly the signal the feedback textarea is meant to capture.
 */
function GeneratedOutputsPanel({ runId, status }: { runId: string; status: EvalRunStatus }) {
  const [entries, setEntries] = useState<EvalRunOutputEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const list = await window.nakiros.listEvalRunOutputs(runId);
      setEntries(list);
      // Prefer the first markdown/text file, fall back to first entry
      if (list.length > 0 && !selected) {
        const preferred = list.find((e) => isMarkdown(e.relativePath)) ?? list.find((e) => isRenderableAsText(e.relativePath)) ?? list[0];
        setSelected(preferred.relativePath);
      }
    } catch (err) {
      console.error('Failed to list outputs', err);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    if (!isRenderableAsText(selected)) {
      setContent(null);
      return;
    }
    setLoading(true);
    window.nakiros
      .readEvalRunOutput(runId, selected)
      .then((c) => setContent(c))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, [runId, selected]);

  if (entries.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={12} className="text-[var(--text-muted)]" />
            <span className="font-semibold text-[var(--text-primary)]">Generated files</span>
            <span className="text-[var(--text-muted)]">— none</span>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={10} />
            Refresh
          </button>
        </div>
        <p className="mt-2 text-[var(--text-muted)]">
          {status === 'failed'
            ? 'Run failed before producing any output.'
            : 'The agent did not write any files under outputs/.'}
        </p>
      </div>
    );
  }

  const selectedEntry = entries.find((e) => e.relativePath === selected) ?? null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <FileText size={12} className="text-emerald-400" />
          <span className="font-semibold text-[var(--text-primary)]">Generated files</span>
          <span className="text-[var(--text-muted)]">({entries.length})</span>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={10} />
          Refresh
        </button>
      </div>
      <div className="flex">
        {/* File list */}
        <div className="w-[220px] shrink-0 border-r border-[var(--line)]">
          <div className="max-h-[400px] overflow-y-auto py-1">
            {entries.map((entry) => (
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
            ))}
          </div>
        </div>

        {/* Viewer */}
        <div className="min-w-0 flex-1 p-3">
          {selectedEntry && !isRenderableAsText(selectedEntry.relativePath) && (
            <div className="text-xs text-[var(--text-muted)]">
              <code className="text-[var(--text-primary)]">{selectedEntry.relativePath}</code> is a binary file ({formatBytes(selectedEntry.sizeBytes)}). Preview is disabled.
            </div>
          )}
          {selectedEntry && isRenderableAsText(selectedEntry.relativePath) && loading && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 size={12} className="animate-spin" />
              Loading…
            </div>
          )}
          {selectedEntry && isRenderableAsText(selectedEntry.relativePath) && !loading && content !== null && (
            <div className="max-h-[500px] overflow-y-auto">
              {isMarkdown(selectedEntry.relativePath) ? (
                <MarkdownViewer content={content} className="px-0 py-0" />
              ) : (
                <pre className="whitespace-pre-wrap break-all text-xs text-[var(--text-primary)]">{content}</pre>
              )}
            </div>
          )}
          {selectedEntry && isRenderableAsText(selectedEntry.relativePath) && !loading && content === null && (
            <div className="text-xs text-[var(--text-muted)]">(unable to read file)</div>
          )}
        </div>
      </div>
    </div>
  );
}
