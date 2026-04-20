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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MarkdownViewer } from '../components/ui';
import {
  ConversationTurn,
  liveEventsToBlocks,
  legacyTurnToBlocks,
  endsOnAssistant,
  type LiveStreamEvent,
} from '../components/ConversationTurn';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import type { SkillEvalRun, EvalRunEvent, EvalRunStatus, EvalRunOutputEntry, SkillScope } from '@nakiros/shared';

interface Props {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  skillName: string;
  initialRunIds: string[];
  iteration: number;
  onClose(): void;
}

type LiveEvent = LiveStreamEvent;

export default function EvalRunsView({ scope, projectId, pluginName, skillName, initialRunIds, iteration, onClose }: Props) {
  const { t } = useTranslation('evals');
  const [runs, setRuns] = useState<Map<string, SkillEvalRun>>(new Map());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunIds[0] ?? null);
  const [liveEventsByRun, setLiveEventsByRun] = useState<Map<string, LiveEvent[]>>(new Map());
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  // Load feedback for this iteration
  useEffect(() => {
    void window.nakiros.getEvalFeedback({ scope, projectId, pluginName, skillName, iteration }).then(setFeedback);
  }, [scope, projectId, pluginName, skillName, iteration]);

  async function saveFeedback(evalName: string, text: string) {
    setFeedback((prev) => ({ ...prev, [evalName]: text }));
    await window.nakiros.saveEvalFeedback({ scope, projectId, pluginName, skillName, iteration, evalName, feedback: text });
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
    <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </button>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {t('headerTitle', { skillName, iteration })}
        </span>
        <div className="ml-auto flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>
            {t('completeCount', { completed, total: runsList.length })}
          </span>
          {running > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--primary)]">{t('runningCount', { count: running })}</span>
            </>
          )}
          <span>·</span>
          <span>{t('elapsed', { duration: formatDuration(elapsed, t) })}</span>
          <span>·</span>
          <span>{t('tokensUsed', { tokens: formatTokens(totalTokens, t) })}</span>
          {!allDone && (
            <button
              onClick={handleStopAll}
              className="ml-2 flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/30"
            >
              <Square size={12} />
              {t('stopAll')}
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
                  label={t('withSkill')}
                  selected={selectedRunId === pair.withSkill.runId}
                  onClick={() => setSelectedRunId(pair.withSkill!.runId)}
                  t={t}
                />
              )}
              {pair.withoutSkill && (
                <RunListItem
                  run={pair.withoutSkill}
                  label={t('withoutBaseline')}
                  selected={selectedRunId === pair.withoutSkill.runId}
                  onClick={() => setSelectedRunId(pair.withoutSkill!.runId)}
                  t={t}
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
              t={t}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
              {t('selectRun')}
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
  t,
}: {
  run: SkillEvalRun;
  label: string;
  selected: boolean;
  onClick(): void;
  t: TFunction<'evals'>;
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
        {run.tokensUsed > 0 && formatTokens(run.tokensUsed, t)}
        {run.durationMs > 0 && ` · ${formatDuration(run.durationMs, t)}`}
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
  t,
}: {
  run: SkillEvalRun;
  liveEvents: LiveEvent[];
  onStop(runId: string): void;
  feedback: string;
  onSaveFeedback(text: string): void | Promise<void>;
  t: TFunction<'evals'>;
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
    setUserInput('');
    try {
      await window.nakiros.sendEvalUserMessage(run.runId, trimmed);
    } catch (err) {
      setUserInput(trimmed);
      alert(t('alertSendFailed', { message: (err as Error).message }));
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
      alert(t('alertFinishFailed', { message: (err as Error).message }));
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
            <span>{run.config === 'with_skill' ? t('configWithSkill') : t('configWithoutSkill')}</span>
            <span>·</span>
            <span>{t(`status.${statusToKey(run.status)}` as const)}</span>
            {run.tokensUsed > 0 && (
              <>
                <span>·</span>
                <span>{formatTokens(run.tokensUsed, t)}</span>
              </>
            )}
            {run.durationMs > 0 && (
              <>
                <span>·</span>
                <span>{formatDuration(run.durationMs, t)}</span>
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
            {t('stop')}
          </button>
        )}
      </div>

      {run.error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={12} />
            {t('errorLabel')}
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono">{run.error}</pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* Prompt */}
        <Section
          title={t('promptTitle')}
          expanded={expanded === 'turns'}
          onToggle={() => setExpanded(expanded === 'turns' ? null : 'turns')}
        >
          <pre className="whitespace-pre-wrap rounded bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-primary)]">
            {run.prompt}
          </pre>
        </Section>

        {/* Conversation — user prompt + assistant turns with ordered text/tool
            blocks. While the run is streaming, we append a provisional assistant
            turn built from live events so the user sees each Read/Bash/Write
            appear in place as it happens (like the Claude Code extension). */}
        {(run.turns.length > 0 || (isRunning && liveEvents.length > 0)) && (
          <div className="mt-4 flex flex-col gap-2">
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

            {/* Provisional turn: events streaming in right now, not yet saved
                to run.turns. Disappears as soon as the real turn lands. */}
            {isRunning &&
              liveEvents.length > 0 &&
              !endsOnAssistant(run.turns) && (
                <ConversationTurn
                  key="provisional"
                  role="assistant"
                  timestamp={new Date().toISOString()}
                  blocks={liveEventsToBlocks(liveEvents)}
                  streaming
                  scrollRef={liveScrollRef}
                />
              )}

            {isRunning &&
              liveEvents.length === 0 &&
              !endsOnAssistant(run.turns) && (
                <ThinkingIndicator
                  verbs={t('thinking.verbs', { returnObjects: true }) as string[]}
                />
              )}
          </div>
        )}

        {isTerminal && <GeneratedOutputsPanel runId={run.runId} status={run.status} t={t} />}

        {isTerminal && run.usesSandbox && <SandboxDiffPanel runId={run.runId} t={t} />}

        {/* Human feedback panel — visible once a run is terminal (not while running) */}
        {isTerminal && (
          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={12} className="text-[var(--text-muted)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{t('feedback.title')}</span>
                {!feedback && !feedbackDirty && (
                  <span className="text-[10px] text-[var(--text-muted)]">{t('feedback.emptyHint')}</span>
                )}
                {feedback && !feedbackDirty && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">{t('feedback.savedBadge')}</span>
                )}
              </div>
              <button
                onClick={handleSaveFeedback}
                disabled={!feedbackDirty || feedbackSaving}
                className="rounded bg-[var(--primary)] px-2 py-1 text-[10px] font-medium text-white transition-colors disabled:opacity-50"
              >
                {feedbackSaving ? t('feedback.saving') : t('feedback.save')}
              </button>
            </div>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder={t('feedback.placeholder')}
              className="min-h-[80px] w-full resize-y rounded border border-[var(--line)] bg-[var(--bg)] p-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        )}
      </div>

      {/* Interactive input panel */}
      {isWaiting && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">
            <MessageSquare size={12} />
            {t('waitingForInput')}
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
              placeholder={t('userInputPlaceholder')}
              className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSend}
                disabled={!userInput.trim() || sending}
                aria-label={t('send')}
                title={t('send')}
                className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] p-2.5 text-white transition-colors hover:bg-[var(--primary)]/90 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
              <button
                onClick={handleFinish}
                disabled={sending}
                aria-label={t('finish')}
                className="flex shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
                title={t('finishTooltip')}
              >
                <Flag size={16} />
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


function formatTokens(n: number, t: TFunction<'evals'>): string {
  if (n < 1000) return t('units.tokens', { count: n });
  return t('units.tokensThousands', { value: (n / 1000).toFixed(1) });
}

function formatDuration(ms: number, t: TFunction<'evals'>): string {
  if (ms < 1000) return t('units.milliseconds', { count: ms });
  if (ms < 60000) return t('units.seconds', { value: (ms / 1000).toFixed(1) });
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return t('units.minutes', { minutes: min, seconds: sec });
}

function formatBytes(n: number, t: TFunction<'evals'>): string {
  if (n < 1024) return t('units.bytes', { count: n });
  if (n < 1024 * 1024) return t('units.kilobytes', { value: (n / 1024).toFixed(1) });
  return t('units.megabytes', { value: (n / (1024 * 1024)).toFixed(1) });
}

function statusToKey(status: EvalRunStatus): string {
  if (status === 'waiting_for_input') return 'waitingForInput';
  return status;
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
function GeneratedOutputsPanel({ runId, status, t }: { runId: string; status: EvalRunStatus; t: TFunction<'evals'> }) {
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
            <span className="font-semibold text-[var(--text-primary)]">{t('outputs.title')}</span>
            <span className="text-[var(--text-muted)]">{t('outputs.none')}</span>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={10} />
            {t('outputs.refresh')}
          </button>
        </div>
        <p className="mt-2 text-[var(--text-muted)]">
          {status === 'failed'
            ? t('outputs.noneFailed')
            : t('outputs.noneWritten')}
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
          <span className="font-semibold text-[var(--text-primary)]">{t('outputs.title')}</span>
          <span className="text-[var(--text-muted)]">{t('outputs.count', { count: entries.length })}</span>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={10} />
          {t('outputs.refresh')}
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
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{formatBytes(entry.sizeBytes, t)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Viewer */}
        <div className="min-w-0 flex-1 p-3">
          {selectedEntry && !isRenderableAsText(selectedEntry.relativePath) && (
            <div className="text-xs text-[var(--text-muted)]">
              <code className="text-[var(--text-primary)]">{selectedEntry.relativePath}</code> {t('outputs.binaryNotice', { size: formatBytes(selectedEntry.sizeBytes, t) })}
            </div>
          )}
          {selectedEntry && isRenderableAsText(selectedEntry.relativePath) && loading && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 size={12} className="animate-spin" />
              {t('outputs.loading')}
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
            <div className="text-xs text-[var(--text-muted)]">{t('outputs.unableToRead')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the `git diff HEAD` captured from a run's sandbox — the artefact of
 * "what the skill would have changed if applied to the real project". Shown
 * only for runs that used a sandbox (usesSandbox=true); for those, the diff
 * is the only record of code-level modifications the agent made.
 */
function SandboxDiffPanel({ runId, t }: { runId: string; t: TFunction<'evals'> }) {
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    window.nakiros
      .readEvalRunDiffPatch(runId)
      .then((p) => setPatch(p))
      .catch(() => setPatch(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const isEmpty = !loading && (patch === null || patch.trim().length === 0);

  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <FileText size={12} className="text-amber-400" />
          <span className="font-semibold text-[var(--text-primary)]">{t('sandboxDiff.title')}</span>
          <span className="text-[var(--text-muted)]">{t('sandboxDiff.subtitle')}</span>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={10} />
          {t('sandboxDiff.refresh')}
        </button>
      </div>
      <div className="p-3">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 size={12} className="animate-spin" />
            {t('sandboxDiff.loading')}
          </div>
        )}
        {!loading && isEmpty && (
          <div className="text-xs text-[var(--text-muted)]">
            {t('sandboxDiff.noChanges')}
          </div>
        )}
        {!loading && !isEmpty && patch !== null && (
          <pre className="max-h-[500px] overflow-y-auto whitespace-pre break-all font-mono text-[11px] text-[var(--text-primary)]">
            {patch}
          </pre>
        )}
      </div>
    </div>
  );
}
