import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  Rocket,
  Square,
  XCircle,
} from 'lucide-react';
import type {
  BootstrapRun,
  BootstrapRunEvent,
  BootstrapRunStatus,
  BootstrapTimelineEntry,
  FixUsage,
  Project,
} from '@nakiros/shared';
import { useRunState, type RunStateApi } from '../hooks/useRunState';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { formatAuditTimestamp } from '../lib/run-display';
import { formatComputeDuration, formatTokens } from '../utils/format';
import RunStream from '../components/runs/RunStream';
import { RunErrorBanner } from '../components/runs';
import { BootstrapComposer } from '../components/bootstrap/BootstrapComposer';
import { BootstrapPlanPanel } from '../components/bootstrap/BootstrapPlanPanel';
import {
  effectiveDecision,
  type ProposalDecisions,
  type ProposalEdits,
} from '../components/bootstrap/proposal-decision';

interface Props {
  project: Project;
}

const TERMINAL_STATUSES = new Set<BootstrapRunStatus>(['completed', 'failed', 'stopped']);

/** Generic run-state wiring for `bootstrap:*` — built inline rather than
 *  through `lib/run-api.ts#getRunAPI`. `'bootstrap'` IS a member of the
 *  shared `AgentRunKind` union (`agent-run.ts`) and `getRunAPI` does have a
 *  `'bootstrap'` case — but only so the topbar `RunDock`'s generic stop
 *  button works. This screen still builds its own wiring because the
 *  bootstrap run shape carries an approval/plan lifecycle the generic
 *  audit-like run screen (`RunScreen.tsx`/`AuditLikeRunScreen`) doesn't
 *  model. `useRunState` itself is generic over the run/event types, so
 *  it's reused as-is. */
const bootstrapRunAPI: RunStateApi<BootstrapRun, BootstrapRunEvent['event']> = {
  getRun: (id) => window.nakiros.getBootstrapRun(id),
  getBufferedEvents: (id) => window.nakiros.getBootstrapBufferedEvents(id),
  onEvent: window.nakiros.onBootstrapEvent,
};

/**
 * Project-level entry point for the `.claude` Bootstrap feature
 * (`docs/redesign/features/project-bootstrap.md`). Reached from the
 * sidebar ("Bootstrap") and from the Overview "Configuration" shortcuts,
 * mirroring every other singleton entity screen (Hooks, Permissions, MCP).
 *
 * Structurally this mirrors the canonical Skill-screen pattern (breadcrumb
 * header, one lifecycle per screen) but does NOT reproduce its tab strip:
 * bootstrap has no independent Audit/Evals/Fix/Files facets to browse —
 * it's a single interactive session (analyse → discuss → approve →
 * execute) that ends by writing into the *other* entity screens. The
 * closest existing precedent for "pick a past run or start a new one" is
 * `AuditHistoryPicker`; this screen inlines the same idea as a simple list
 * instead of a dropdown since there's at most one run worth surfacing per
 * project at a time.
 */
export default function BootstrapScreen({ project }: Props) {
  const { t } = useTranslation('bootstrap');
  const [runs, setRuns] = useState<BootstrapRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Gates the auto-attach-to-active-run behavior below to the very first
  // `loadRuns` call after mount. Without this, an explicit Back click
  // (`setSelectedRunId(null)` followed by `loadRuns()`) immediately
  // re-selects the still-active run — `current` reads `null` by the time
  // the refresh resolves, so the auto-select branch would fire again and
  // the user could never reach the history list while a run is active.
  const hasAutoSelectedRef = useRef(false);

  const loadRuns = useCallback(async () => {
    try {
      const all = await window.nakiros.listAllBootstrapRuns();
      const mine = all
        .filter((r) => r.projectId === project.id)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setRuns(mine);
      if (!hasAutoSelectedRef.current) {
        hasAutoSelectedRef.current = true;
        // Auto-attach to an in-flight run so first landing on the screen
        // resumes it instead of offering to start a redundant second one
        // (`start` is idempotent per project daemon-side, but surfacing
        // the existing run directly is less surprising).
        setSelectedRunId((current) => {
          if (current) return current;
          const active = mine.find((r) => !TERMINAL_STATUSES.has(r.status));
          return active?.runId ?? null;
        });
      }
    } catch {
      setRuns([]);
    }
  }, [project.id]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const run = await window.nakiros.startBootstrap({
        projectId: project.id,
        projectPath: project.projectPath,
      });
      setSelectedRunId(run.runId);
      void loadRuns();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  if (selectedRunId) {
    return (
      <BootstrapRunView
        key={selectedRunId}
        runId={selectedRunId}
        onBack={() => {
          setSelectedRunId(null);
          void loadRuns();
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      <div className="flex items-center gap-3 border-b border-n-border-subtle px-7 py-3.5">
        <Rocket size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">
          {t('title', { defaultValue: 'Project Bootstrap' })}
        </strong>
        <span
          className="truncate font-n-mono text-[11px] text-n-faint"
          title={project.projectPath}
        >
          {project.projectPath}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="mx-auto max-w-[720px]">
          <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-n-md bg-n-accent-soft text-n-accent">
                <Rocket size={20} strokeWidth={2} />
              </div>
              <div className="flex-1">
                <h3 className="m-0 text-[15px] font-semibold text-n-fg">
                  {t('intro.title', { defaultValue: 'Bootstrap this project’s .claude/' })}
                </h3>
                <p className="mt-1.5 text-[13px] leading-snug text-n-muted">
                  {t('intro.body', {
                    defaultValue:
                      'Analyses the codebase, the existing .claude/ configuration, and (optionally) conversation frictions, then proposes one coherent plan covering CLAUDE.md, rules, subagents, hooks, permissions, MCP and output styles. You review and approve every entity before anything is written.',
                  })}
                </p>
                {startError && (
                  <div className="mt-3 rounded-n-sm border border-n-critical bg-n-critical-soft px-2.5 py-1.5 font-n-mono text-[11px] text-n-critical">
                    {startError}
                  </div>
                )}
                <div className="mt-3.5">
                  <button
                    type="button"
                    disabled={starting}
                    onClick={() => void handleStart()}
                    className={
                      'inline-flex h-8 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent-strong ' +
                      (starting ? 'opacity-60' : 'hover:bg-n-accent-soft/80')
                    }
                  >
                    {starting ? (
                      <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />
                    ) : (
                      <Play size={12} strokeWidth={2.25} />
                    )}
                    {starting
                      ? t('intro.starting', { defaultValue: 'Starting…' })
                      : t('intro.start', { defaultValue: 'Start bootstrap' })}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {runs === null ? (
            <div className="mt-6 font-n-mono text-[12px] text-n-muted">
              {t('history.loading', { defaultValue: 'Loading…' })}
            </div>
          ) : runs.length > 0 ? (
            <div className="mt-6">
              <div className="mb-2 font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
                {t('history.title', { defaultValue: 'Previous runs' })}
              </div>
              <div className="flex flex-col gap-1.5">
                {runs.map((r) => (
                  <HistoryRow key={r.runId} run={r} onOpen={() => setSelectedRunId(r.runId)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ run, onOpen }: { run: BootstrapRun; onOpen(): void }) {
  const { t } = useTranslation('bootstrap');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5 text-left transition-colors hover:border-n-border-default hover:bg-n-raised"
    >
      <StatusPill status={run.status} />
      <span className="min-w-0 flex-1 truncate font-n-mono text-[11.5px] text-n-muted">
        {formatAuditTimestamp(run.startedAt)}
      </span>
      <span className="flex-shrink-0 font-n-mono text-[10.5px] text-n-faint">
        {t('history.proposalsCount', {
          defaultValue: '{{count}} proposals',
          // `listAllBootstrapRuns` payloads carry a slim `plan: null` +
          // `proposalCount` (the full plan only comes from getRun /
          // startBootstrap / events) — read the count field first so this
          // row works with both the slim and full payload shapes.
          count: run.proposalCount ?? run.plan?.proposals.length ?? 0,
        })}
      </span>
    </button>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: BootstrapRunStatus }) {
  const { t } = useTranslation('bootstrap');
  const conf = STATUS_VISUAL[status];
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1.5 font-n-mono text-[11px]"
      style={{ color: conf.color }}
    >
      {conf.pulse && (
        <span className="n-pulse h-1.5 w-1.5 rounded-full" style={{ background: conf.color }} />
      )}
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}

const STATUS_VISUAL: Record<BootstrapRunStatus, { color: string; pulse?: boolean }> = {
  starting: { color: 'var(--n-info)', pulse: true },
  running: { color: 'var(--n-accent)', pulse: true },
  waiting_for_input: { color: 'var(--n-watch)', pulse: true },
  awaiting_approval: { color: 'var(--n-violet)', pulse: true },
  executing: { color: 'var(--n-watch)', pulse: true },
  completed: { color: 'var(--n-healthy)' },
  failed: { color: 'var(--n-critical)' },
  stopped: { color: 'var(--n-fg-faint)' },
};

// ── Run view (boot) ──────────────────────────────────────────────────────────

function BootstrapRunView({ runId, onBack }: { runId: string; onBack(): void }) {
  const { t } = useTranslation('bootstrap');
  const [bootedRun, setBootedRun] = useState<BootstrapRun | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBootedRun(null);
    setBootError(null);
    window.nakiros
      .getBootstrapRun(runId)
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
  }, [runId, t]);

  if (bootError) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <RunHeaderBar title={t('title', { defaultValue: 'Project Bootstrap' })} onBack={onBack} />
        <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
          {bootError}
        </div>
      </div>
    );
  }

  if (!bootedRun) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <RunHeaderBar title={t('title', { defaultValue: 'Project Bootstrap' })} onBack={onBack} />
        <div className="px-7 py-6 font-n-mono text-[12px] text-n-muted">
          {t('boot.loading', { defaultValue: 'Loading…' })}
        </div>
      </div>
    );
  }

  return <BootstrapRunBody runId={runId} bootedRun={bootedRun} onBack={onBack} />;
}

function RunHeaderBar({ title, onBack }: { title: string; onBack(): void }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-n-border-subtle px-6 py-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
      >
        <ArrowLeft size={14} strokeWidth={2} />
      </button>
      <span className="h-3.5 w-px bg-n-border-subtle" />
      <Rocket size={15} strokeWidth={2} className="text-n-accent" />
      <span className="text-[13.5px] font-medium text-n-fg">{title}</span>
    </div>
  );
}

// ── Run body — rendered once the initial run has loaded ─────────────────────

function BootstrapRunBody({
  runId,
  bootedRun,
  onBack,
}: {
  runId: string;
  bootedRun: BootstrapRun;
  onBack(): void;
}) {
  const { t } = useTranslation('bootstrap');
  const [timeline, setTimeline] = useState<BootstrapTimelineEntry[]>([]);
  const [usage, setUsage] = useState<FixUsage | null>(null);
  const [decisions, setDecisions] = useState<ProposalDecisions>({});
  const [edits, setEdits] = useState<ProposalEdits>({});
  const [isStopping, setIsStopping] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const { run, setRun, liveEvents, handlerError } = useRunState<BootstrapRun, BootstrapRunEvent['event']>(
    runId,
    bootedRun,
    bootstrapRunAPI,
    (inner) => {
      if ((inner as { type: string }).type === 'plan_updated') {
        const plan = (inner as Extract<BootstrapRunEvent['event'], { type: 'plan_updated' }>).plan;
        setRun((r) => ({ ...r, plan }));
      }
    },
    2000,
  );

  // Unified conversation timeline from Claude Code's session jsonl — same
  // source and polling cadence as the audit/fix run screens.
  useEffect(() => {
    if (!run.sessionId) {
      setTimeline([]);
      return;
    }
    let cancelled = false;
    const fetchOnce = () =>
      window.nakiros
        .getBootstrapTimeline(run.runId)
        .then((tl) => {
          if (!cancelled) setTimeline(tl);
        })
        .catch(() => {
          if (!cancelled) setTimeline([]);
        });
    void fetchOnce();
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [run.runId, run.sessionId, run.status]);

  // Billed-equivalent tokens + agent-active time from the session JSONL
  // (`.claude/rules/token-accounting.md` — never roll a custom counter).
  useEffect(() => {
    if (!run.sessionId) return;
    let cancelled = false;
    const fetchOnce = () =>
      window.nakiros
        .getBootstrapUsage(run.runId)
        .then((u) => {
          if (!cancelled) setUsage(u);
        })
        .catch(() => undefined);
    void fetchOnce();
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [run.runId, run.sessionId, run.status]);

  const elapsed = useElapsedTimer(run.startedAt);
  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input' || run.status === 'awaiting_approval';
  const isTerminal = TERMINAL_STATUSES.has(run.status);
  const canStop = !isTerminal && run.status !== 'executing';
  const canFinish = isTerminal || run.status === 'executing';

  let elapsedMs = usage?.agentActiveMs ?? elapsed;
  if (usage && isRunning && usage.lastUserMessageAt) {
    const delta = Date.now() - new Date(usage.lastUserMessageAt).getTime();
    if (Number.isFinite(delta) && delta > 0) elapsedMs = usage.agentActiveMs + delta;
  } else if (isTerminal) {
    elapsedMs = run.durationMs || elapsedMs;
  }

  const toggleDecision = useCallback(
    (id: string) => {
      setDecisions((prev) => {
        const proposal = run.plan?.proposals.find((p) => p.id === id);
        // Compute the next value from the *effective* current decision
        // (falls back to the proposal's own persisted status, not a blanket
        // 'accepted') so a first click on an already agent-rejected
        // proposal actually flips it instead of being a no-op — see
        // `effectiveDecision`'s doc comment.
        const current = proposal ? effectiveDecision(proposal, prev) : (prev[id] ?? 'accepted');
        return { ...prev, [id]: current === 'accepted' ? 'rejected' : 'accepted' };
      });
    },
    [run.plan],
  );

  const editContent = useCallback((id: string, content: string) => {
    setEdits((prev) => ({ ...prev, [id]: content }));
  }, []);

  async function handleStop() {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await window.nakiros.stopBootstrap(run.runId);
      const fresh = await window.nakiros.getBootstrapRun(run.runId);
      if (fresh) setRun(fresh);
    } catch (err) {
      console.error('[bootstrap] stop failed', err);
    } finally {
      setIsStopping(false);
    }
  }

  async function handleFinish() {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await window.nakiros.finishBootstrap(run.runId);
      onBack();
    } catch (err) {
      console.error('[bootstrap] finish failed', err);
      setIsFinishing(false);
    }
  }

  async function handleSend(message: string) {
    await window.nakiros.sendBootstrapUserMessage(run.runId, message);
  }

  async function handleApprove() {
    if (!run.plan || isApproving) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const payload = {
        runId: run.runId,
        decisions: run.plan.proposals.map((p) => ({
          id: p.id,
          status: effectiveDecision(p, decisions),
          content: edits[p.id],
        })),
      };
      const fresh = await window.nakiros.approveBootstrapPlan(payload);
      setRun(fresh);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  }

  // Shared between the full-width (no plan yet) and split (plan under
  // review) layouts below — the conversation itself doesn't change shape,
  // only how much horizontal room its containing column gets.
  const chatBody = (
    <>
      <RunStream turns={[]} liveEvents={liveEvents} isStreaming={isRunning} timeline={timeline} />
      {!isTerminal && run.status !== 'executing' && (
        <BootstrapComposer isWaiting={isWaiting} isRunning={isRunning} onSend={handleSend} />
      )}
    </>
  );

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-6 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} /> {t('back', { defaultValue: 'Back' })}
        </button>
        <span className="h-3.5 w-px bg-n-border-subtle" />
        <Rocket size={15} strokeWidth={2} className="text-n-accent" />
        <div className="min-w-0 flex-1">
          <StatusPill status={run.status} />
          <div className="mt-0.5 truncate text-[13.5px] font-medium text-n-fg">
            {t('title', { defaultValue: 'Project Bootstrap' })}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3.5">
          <HeaderStat
            label={t('stats.tokens', { defaultValue: 'Tokens' })}
            value={formatTokens(usage?.billedEquivalent ?? run.tokensUsed)}
          />
          <HeaderStat
            label={t('stats.elapsed', { defaultValue: 'Elapsed' })}
            value={formatComputeDuration(elapsedMs)}
          />
        </div>
        {(canStop || canFinish) && (
          <>
            <span className="h-3.5 w-px bg-n-border-subtle" />
            <div className="flex flex-shrink-0 gap-1.5">
              {canStop && (
                <button
                  type="button"
                  disabled={isStopping}
                  onClick={() => void handleStop()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-critical/40 bg-n-critical-soft px-2.5 font-n-mono text-[11.5px] text-n-critical disabled:opacity-60"
                >
                  {isStopping ? (
                    <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />
                  ) : (
                    <Square size={12} strokeWidth={2.25} />
                  )}
                  {isStopping ? t('stopping', { defaultValue: 'Stopping…' }) : t('stop', { defaultValue: 'Stop' })}
                </button>
              )}
              {canFinish && (
                <button
                  type="button"
                  disabled={isFinishing}
                  onClick={() => void handleFinish()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent disabled:opacity-60"
                >
                  {isFinishing ? (
                    <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />
                  ) : run.status === 'completed' ? (
                    <CheckCircle2 size={12} strokeWidth={2.25} />
                  ) : run.status === 'failed' ? (
                    <XCircle size={12} strokeWidth={2.25} />
                  ) : (
                    <CheckCircle2 size={12} strokeWidth={2.25} />
                  )}
                  {isFinishing ? t('finishing', { defaultValue: 'Closing…' }) : t('finish', { defaultValue: 'Close' })}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <RunErrorBanner message={handlerError ?? run.error} title={t('error.title', { defaultValue: 'Error' })} />

      {/* Body — before a plan exists, the conversation gets the full width
          (nothing to review yet). Once `run.plan` is set (validation step —
          `awaiting_approval`, and it stays visible through `executing` /
          terminal so the user can still see what was approved), the layout
          becomes a two-column split: chat 1/3, plan documents 2/3, so the
          proposals dominate the screen. Same `minmax()` CSS-grid ratio
          pattern as the 3-pane `IdeRunScreen` (chat/code/files), just with
          two tracks instead of three — reused rather than inventing a new
          layout mechanism. `minmax(280px, 1fr)` keeps the chat column from
          becoming unusably thin on a narrow window instead of shrinking
          all the way down with the 1fr track. */}
      {run.plan ? (
        <div
          className="grid flex-1 overflow-hidden"
          style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2fr)' }}
        >
          <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-n-border-subtle">
            {chatBody}
          </div>
          <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-n-surface">
            {approveError && (
              <div className="mx-4 mt-3 rounded-n-sm border border-n-critical bg-n-critical-soft px-2.5 py-1.5 font-n-mono text-[11px] text-n-critical">
                {approveError}
              </div>
            )}
            <BootstrapPlanPanel
              plan={run.plan}
              status={run.status}
              decisions={decisions}
              edits={edits}
              onToggleDecision={toggleDecision}
              onEditContent={editContent}
              onApprove={() => void handleApprove()}
              approving={isApproving}
            />
          </aside>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{chatBody}</div>
      )}
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-px leading-tight">
      <span className="font-n-mono text-[9.5px] uppercase tracking-[0.8px] text-n-faint">{label}</span>
      <span className="font-n-mono tabular-nums text-[12px] text-n-fg">{value}</span>
    </div>
  );
}
