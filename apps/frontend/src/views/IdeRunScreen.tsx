import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRunKind, AuditRun, AuditRunEvent, FixTimelineEntry, FixUsage } from '@nakiros/shared';
import { agentRunStore } from '../lib/agent-run-store';
import { getRunAPI, type AuditLikeRun, type AuditLikeEvent } from '../lib/run-api';
import { runDisplayContext } from '../lib/run-display';
import { useRunState } from '../hooks/useRunState';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { invalidateSkillDiffCache } from '../components/diff/SkillDiffView';
import { launchCreateEval, launchFixEval } from '../lib/run-launcher';
import NewRunHeader from '../components/runs/NewRunHeader';
import IdeChatPanel from '../components/runs/ide/IdeChatPanel';
import IdeCodeViewer from '../components/runs/ide/IdeCodeViewer';
import IdeFileList from '../components/runs/ide/IdeFileList';
import type { QuoteSelection } from '../components/runs/ide/types';

// ─── Shared helpers (mirrors of RunScreen internals) ─────────────────────────

function mapAuditStatus(status: AuditRun['status']): import('@nakiros/shared').AgentRunStatus {
  switch (status) {
    case 'starting':   return 'pending';
    case 'running':    return 'running';
    case 'waiting_for_input': return 'awaiting_input';
    case 'completed':  return 'done';
    case 'failed':     return 'failed';
    case 'stopped':    return 'cancelled';
  }
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ${seconds % 60}s`;
}

/** Tool names that invalidate the diff cache when they fire. */
const DIFF_INVALIDATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// ─── Props ────────────────────────────────────────────────────────────────────

interface IdeRunScreenProps {
  runId: string;
  runKind: AgentRunKind;
  onClose(): void;
  onOpenRunTab?: import('../lib/run-launcher').OpenRunTabCallback;
}

// ─── Boot wrapper (mirrors AuditLikeRunScreen's loading/error shell) ─────────

/**
 * IDE-style 3-pane run screen for edit / fix / create run kinds.
 *
 * `RunScreen` dispatches here for those kinds. Audit stays on
 * `AuditLikeRunScreen` — it's read-only and doesn't benefit from the code
 * viewer / quote-from-file workflow.
 *
 * Layout: `[Chat (1/4)] | [Code viewer (2/4)] | [File list (1/4)]`
 *
 * This component handles the boot phase (fetching the initial run snapshot)
 * and renders either a loading skeleton, an error state, or the main body
 * via {@link IdeRunScreenBody}.
 */
export default function IdeRunScreen({ runId, runKind, onClose, onOpenRunTab }: IdeRunScreenProps) {
  const { t } = useTranslation('runs');
  const api = useMemo(() => getRunAPI(runKind), [runKind]);
  const initialFromStore = agentRunStore.get(runId);

  const [bootedRun, setBootedRun] = useState<AuditLikeRun | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setBootedRun(null);
    setBootError(null);
    api.state
      .getRun(runId)
      .then((fresh) => {
        if (cancelled) return;
        if (!fresh) {
          setBootError(t('boot.notFound', { defaultValue: 'Run not found or already discarded.' }));
          return;
        }
        setBootedRun(fresh);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, runId, t]);

  if (!api) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center font-n-sans text-n-muted">
        <p className="font-n-mono text-[12px]">
          {t('unsupported.body', { defaultValue: 'This run kind is not supported in IDE mode.' })}
        </p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <NewRunHeader kind={runKind} status="failed" title={initialFromStore?.title ?? runId} onBack={onClose} />
        <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
          {bootError}
        </div>
      </div>
    );
  }

  if (!bootedRun) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <NewRunHeader kind={runKind} status="pending" title={initialFromStore?.title ?? runId} onBack={onClose} />
        <div className="px-7 py-6 font-n-mono text-[12px] text-n-muted">
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      </div>
    );
  }

  return (
    <IdeRunScreenBody
      runKind={runKind}
      bootedRun={bootedRun}
      api={api}
      onClose={onClose}
      onOpenRunTab={onOpenRunTab}
    />
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function IdeRunScreenBody({
  runKind,
  bootedRun,
  api,
  onClose,
  onOpenRunTab,
}: {
  runKind: AgentRunKind;
  bootedRun: AuditLikeRun;
  api: NonNullable<ReturnType<typeof getRunAPI>>;
  onClose(): void;
  onOpenRunTab?: import('../lib/run-launcher').OpenRunTabCallback;
}) {
  const { t } = useTranslation('runs');

  // ── Live run state ────────────────────────────────────────────────────────

  const [fixTimeline, setFixTimeline] = useState<FixTimelineEntry[]>([]);
  // Bumped when a write-tool event arrives so both the file list and the code
  // viewer invalidate their caches and re-fetch.
  const [diffRevision, setDiffRevision] = useState(0);

  const diffCacheScope = `fix:${bootedRun.runId}`;

  const { run, setRun, liveEvents, handlerError } = useRunState<AuditLikeRun, AuditLikeEvent>(
    bootedRun.runId,
    bootedRun,
    api.state,
    (inner) => {
      const innerType = (inner as { type: string }).type;

      // Fix/create/edit — invalidate diff cache on write-tool events.
      if (innerType === 'tool') {
        const name = (inner as { name?: string }).name;
        if (name && DIFF_INVALIDATING_TOOLS.has(name)) {
          invalidateSkillDiffCache(diffCacheScope);
          setDiffRevision((n) => n + 1);
        }
        return;
      }

      // Fix-only targets sidebar (no-op for edit/create).
      if (innerType === 'fix_targets') {
        const targets = (inner as { targets: NonNullable<AuditRun['targets']> }).targets;
        if (Array.isArray(targets)) setRun((r) => ({ ...r, targets }));
        return;
      }
    },
    2000,
  );

  // ── Timeline polling ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!run.sessionId) {
      setFixTimeline([]);
      return;
    }
    let cancelled = false;
    const fetchOnce = () => {
      const promise =
        runKind === 'create'
          ? window.nakiros.getCreateTimeline(run.runId)
          : runKind === 'edit'
          ? window.nakiros.getEditTimeline(run.runId)
          : window.nakiros.getFixTimeline(run.runId);
      return promise
        .then((tl) => { if (!cancelled) setFixTimeline(tl); })
        .catch(() => { if (!cancelled) setFixTimeline([]); });
    };
    void fetchOnce();
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runKind, run.runId, run.sessionId, run.status]);

  // ── Session usage ─────────────────────────────────────────────────────────

  const [fixUsage, setFixUsage] = useState<FixUsage | null>(null);
  useEffect(() => {
    if (!run.sessionId) return;
    let cancelled = false;
    const fetchOnce = () => {
      const promise =
        runKind === 'create'
          ? window.nakiros.getCreateUsage(run.runId)
          : runKind === 'edit'
          ? window.nakiros.getEditUsage(run.runId)
          : window.nakiros.getFixUsage(run.runId);
      return promise
        .then((u) => { if (!cancelled) setFixUsage(u); })
        .catch(() => {});
    };
    void fetchOnce();
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runKind, run.runId, run.sessionId, run.status]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const elapsed = useElapsedTimer(run.startedAt);
  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';
  const display = useMemo(() => runDisplayContext(runKind, run), [runKind, run]);
  const status = mapAuditStatus((run as AuditRun).status);

  // ── Header stats ──────────────────────────────────────────────────────────

  const stats: Array<{ label: string; value: string }> = [];
  if (fixUsage) {
    stats.push({ label: 'Tokens', value: formatTokens(fixUsage.billedEquivalent) });
    let displayMs = fixUsage.agentActiveMs;
    if (isRunning && fixUsage.lastUserMessageAt) {
      const delta = Date.now() - new Date(fixUsage.lastUserMessageAt).getTime();
      if (Number.isFinite(delta) && delta > 0) displayMs += delta;
    }
    stats.push({ label: 'Elapsed', value: formatDuration(displayMs) });
  } else {
    if ((run as AuditRun).tokensUsed != null) {
      stats.push({ label: 'Tokens', value: formatTokens((run as AuditRun).tokensUsed as number) });
    }
    stats.push({ label: 'Elapsed', value: formatDuration(isTerminal ? (run as AuditRun).durationMs ?? 0 : elapsed) });
  }

  // ── Stop handler ──────────────────────────────────────────────────────────

  const [isStopping, setIsStopping] = useState(false);

  async function handleStop() {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await api.actions.stop(run.runId);
      const fresh = await api.state.getRun(run.runId);
      if (fresh) setRun(fresh);
    } catch (err) {
      console.error('[ide-run] stop failed', err);
    } finally {
      setIsStopping(false);
    }
  }

  // ── Finish handler ────────────────────────────────────────────────────────

  const [isFinishing, setIsFinishing] = useState(false);

  async function handleFinish() {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await api.actions.finish(run.runId);
      agentRunStore.dismiss(run.runId);
      onClose();
    } catch (err) {
      console.error('[ide-run] finish failed', err);
      setIsFinishing(false);
    }
  }

  // ── Eval button — probe + launch ─────────────────────────────────────────

  const [hasEvalsFile, setHasEvalsFile] = useState(false);
  const [isLaunchingEval, setIsLaunchingEval] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const listDiff =
      runKind === 'create'
        ? window.nakiros.listCreateDiff
        : runKind === 'edit'
          ? window.nakiros.listEditDiff
          : window.nakiros.listFixDiff;
    listDiff(run.runId, { includeUnchanged: true })
      .then((entries) => {
        if (!cancelled) {
          setHasEvalsFile(entries.some((e) => e.relativePath === 'evals/evals.json'));
        }
      })
      .catch(() => {
        if (!cancelled) setHasEvalsFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runKind, run.runId]);

  async function handleLaunchEval() {
    if (isLaunchingEval || !onOpenRunTab) return;
    setIsLaunchingEval(true);
    try {
      const auditRun = run as AuditRun;
      if (runKind === 'create') {
        await launchCreateEval(auditRun, onOpenRunTab);
      } else {
        await launchFixEval(auditRun, onOpenRunTab);
      }
    } catch (err) {
      console.error('[ide-run] launch eval failed', err);
      window.alert(
        t('errors.evalsStartFailed', {
          defaultValue: 'Could not launch evals: {{message}}',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setIsLaunchingEval(false);
    }
  }

  // ── Send handler ──────────────────────────────────────────────────────────

  async function handleSend(message: string) {
    await api.actions.sendUserMessage(run.runId, message);
  }

  // ── Quote chips ───────────────────────────────────────────────────────────

  const [quotes, setQuotes] = useState<QuoteSelection[]>([]);

  const handleAddQuote = useCallback((q: QuoteSelection) => {
    setQuotes((prev) => {
      // Avoid exact duplicates (same file + same range).
      const key = `${q.filePath}:${q.startLine}-${q.endLine}`;
      const existing = prev.some(
        (p) => `${p.filePath}:${p.startLine}-${p.endLine}` === key,
      );
      return existing ? prev : [...prev, q];
    });
  }, []);

  const handleRemoveQuote = useCallback((q: QuoteSelection) => {
    setQuotes((prev) =>
      prev.filter((p) => !(p.filePath === q.filePath && p.startLine === q.startLine && p.endLine === q.endLine)),
    );
  }, []);

  // ── File list + code viewer state ─────────────────────────────────────────

  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
      {/* Header */}
      <NewRunHeader
        kind={runKind}
        status={status}
        title={display.title}
        kindLabelOverride={display.kindLabel}
        stats={stats}
        onBack={onClose}
        onStop={isRunning || isWaiting ? handleStop : undefined}
        onFinish={isWaiting || isTerminal ? handleFinish : undefined}
        isStopping={isStopping}
        // Eval button: only for skill fix/create/edit (not CLAUDE.md or rules
        // which have no eval suite). Visible once the sandbox is settled
        // (completed or waiting for input) and evals/evals.json is present.
        onLaunchEval={
          !display.isClaudemd && !display.isRules && onOpenRunTab
            ? handleLaunchEval
            : undefined
        }
        isLaunchingEval={isLaunchingEval}
        evalsButtonVisible={
          hasEvalsFile && (run.status === 'completed' || run.status === 'waiting_for_input')
        }
      />

      {/* 3-pane body: Chat (1fr) | Code viewer (2fr) | File list (1fr) */}
      <div
        className="flex-1 overflow-hidden"
        style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr' }}
      >
        {/* Left: Chat */}
        <IdeChatPanel
          turns={(run as AuditRun).turns ?? []}
          liveEvents={liveEvents}
          isStreaming={isRunning}
          timeline={fixTimeline}
          isWaiting={isWaiting}
          isRunning={isRunning}
          quotes={quotes}
          onRemoveQuote={handleRemoveQuote}
          onSend={handleSend}
          handlerError={handlerError}
          skillName={(run as AuditRun).skillName}
        />

        {/* Centre: Code viewer */}
        <IdeCodeViewer
          runId={run.runId}
          runKind={runKind}
          selectedFile={selectedFile}
          revision={diffRevision}
          isRunning={isRunning}
          onQuote={handleAddQuote}
        />

        {/* Right: File list */}
        <IdeFileList
          runId={run.runId}
          runKind={runKind}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          revision={diffRevision}
          isRunning={isRunning}
          onRequestRefresh={() => setDiffRevision((n) => n + 1)}
        />
      </div>
    </div>
  );
}
