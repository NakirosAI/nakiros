import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AgentRun,
  AgentRunKind,
  AuditRun,
  AuditRunEvent,
  ChatTimelineEntry,
  EvalMatrix,
  FixEvalResult,
  FixTimelineEntry,
  FixUsage,
  GetEvalMatrixRequest,
  Skill,
  SkillEvalRun,
  SkillScope,
} from '@nakiros/shared';
import { useRunState } from '../hooks/useRunState';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { agentRunStore } from '../lib/agent-run-store';
import { getRunAPI } from '../lib/run-api';
import {
  HumanInteractionPanel,
  RunErrorBanner,
} from '../components/runs';
import { launchFixEval } from '../lib/run-launcher';
import NewRunHeader from '../components/runs/NewRunHeader';
import RunStream from '../components/runs/RunStream';
import RunSidePanel from '../components/runs/RunSidePanel';
import EvalRunRecap from '../components/runs/EvalRunRecap';
import EvalDiffOverlay from '../components/skill/EvalDiffOverlay';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';
import AuditCompletedReport from '../components/runs/AuditCompletedReport';
import {
  FileDiffPanel,
  invalidateSkillDiffCache,
  type SkillDiffFileContent,
  type SkillDiffLabels,
} from '../components/diff/SkillDiffView';
import { ArrowLeft } from 'lucide-react';
import type { SkillDiffFilePayload } from '@nakiros/shared';
import type { LiveStreamEvent } from '../components/ConversationTurn';

interface RunScreenProps {
  /** Run id from the agent run store. */
  runId: string;
  /** Discriminator — drives which IPC channels we subscribe to. */
  runKind: AgentRunKind;
  /** Closes the tab — typically passed by `NewShell.closeTab`. */
  onClose(): void;
  /**
   * Optional callback used by completed-eval recaps to open follow-up
   * runs (Re-run on a different model, Fix the regression). Wired by
   * the shell to its tab manager. When omitted, the recap actions stay
   * disabled rather than crashing.
   */
  onOpenRunTab?: import('../lib/run-launcher').OpenRunTabCallback;
}

/**
 * Phase 4 PR9a — full-screen run view that hosts an in-flight or
 * completed agent run. This first iteration only wires the
 * `audit / fix / create` kinds (they share the same `AuditRun` shape
 * on the daemon side); `eval` and `analyze-convo` show a placeholder
 * until PR9b / PR9c.
 *
 * The screen reuses the existing run primitives (`useRunState`,
 * `AgentActivityFeed`, `HumanInteractionPanel`, `RunErrorBanner`) and
 * wraps them in the new-design header (`NewRunHeader`). The completed
 * audit report is rendered via the same {@link AuditMarkdownViewer}
 * already used by the skill detail screen so the table styling is
 * consistent.
 *
 * Side panels and rich event types (findings / diffs / assertions)
 * from the mockup are intentionally deferred to the PR9b / PR9c
 * sub-PRs, where eval / fix get their kind-specific layouts.
 */
export default function RunScreen(props: RunScreenProps) {
  // Eval is a *batch* of SkillEvalRuns aggregated under one AgentRun,
  // it doesn't fit the audit-style getRun(id) pattern. Routing it via
  // a separate top-level component keeps the hooks order stable in
  // each branch (rules-of-hooks compliance).
  if (props.runKind === 'eval') {
    return (
      <EvalRunScreen
        runId={props.runId}
        onClose={props.onClose}
        onOpenRunTab={props.onOpenRunTab}
      />
    );
  }
  return <AuditLikeRunScreen {...props} />;
}

function AuditLikeRunScreen({ runId, runKind, onClose, onOpenRunTab }: RunScreenProps) {
  const { t } = useTranslation('runs');

  // `getRunAPI` returns a fresh object on every call — without
  // memoisation, every render would invalidate the useEffect deps
  // below (and the `useRunState` subscription) and produce a
  // flicker between the loading state and the chat.
  const api = useMemo(() => getRunAPI(runKind), [runKind]);

  const initialFromStore = agentRunStore.get(runId);

  const [bootedRun, setBootedRun] = useState<AuditRun | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Fetch the initial AuditRun once on mount — `useRunState` then
  // keeps it in sync via the live event subscription (no polling).
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
          setBootError(
            t('boot.notFound', { defaultValue: 'Run not found or already discarded.' }),
          );
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

  // Kinds we don't handle yet → placeholder.
  if (!api) {
    return (
      <UnsupportedKindPlaceholder kind={runKind} runId={runId} title={initialFromStore?.title} onClose={onClose} />
    );
  }

  if (bootError) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <NewRunHeader
          kind={runKind}
          status="failed"
          title={initialFromStore?.title ?? runId}
          onBack={onClose}
        />
        <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
          {bootError}
        </div>
      </div>
    );
  }

  if (!bootedRun) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <NewRunHeader
          kind={runKind}
          status="pending"
          title={initialFromStore?.title ?? runId}
          onBack={onClose}
        />
        <div className="px-7 py-6 font-n-mono text-[12px] text-n-muted">
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      </div>
    );
  }

  return (
    <RunScreenBody
      runKind={runKind}
      bootedRun={bootedRun}
      api={api}
      onClose={onClose}
      onOpenRunTab={onOpenRunTab}
    />
  );
}

// ── Body — rendered once the initial run has loaded ────────────────────────

function RunScreenBody({
  runKind,
  bootedRun,
  api,
  onClose,
  onOpenRunTab,
}: {
  runKind: AgentRunKind;
  bootedRun: AuditRun;
  api: NonNullable<ReturnType<typeof getRunAPI>>;
  onClose(): void;
  onOpenRunTab?: import('../lib/run-launcher').OpenRunTabCallback;
}) {
  const { t } = useTranslation('runs');
  const [reportContent, setReportContent] = useState<string | null>(null);
  // Unified timeline derived from Claude Code's session jsonl — sole
  // source of truth for the conversation view of fix and audit runs.
  // Replaces the prior patchwork of `run.turns[*]` + live `text`/`tool`
  // events + past edits. Eval / create still use the legacy live-event
  // pipeline (their session jsonl story isn't ported yet).
  //
  // The widening to `FixTimelineEntry[]` covers both kinds — audit only
  // populates the universal `user`/`assistant_text`/`tool` variants.
  const [fixTimeline, setFixTimeline] = useState<FixTimelineEntry[]>([]);
  // Bumped when an event lands that should force a fix-timeline refetch
  // outside the regular polling cadence (e.g. `fix_eval_result` arriving
  // while the fix run is paused on `waiting_for_input` and the timer is
  // off). Wired to the timeline-fetch effect via deps.
  const [fixTimelineTick, setFixTimelineTick] = useState(0);
  // When non-null, the chat is replaced by a side-by-side diff for that
  // file. Driven by the user clicking a row in the sandbox panel.
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  // Cache scope for `SkillDiffView` — bumped each time the agent writes
  // again so the diff view re-fetches the new sandbox state. Includes
  // the runId so two parallel fix tabs never share the cache.
  const diffCacheScope = `fix:${bootedRun.runId}`;

  const { run, setRun, liveEvents, liveScrollRef, handlerError } = useRunState<AuditRun, AuditRunEvent['event']>(
    bootedRun.runId,
    bootedRun,
    api.state,
    (inner) => {
      // The daemon emits a `done` event with `reportPath` on audit completion.
      // We narrow on the discriminator to keep TS happy without leaking the
      // audit type into the eval/fix branches (they don't ship in PR9a).
      const innerType = (inner as { type: string }).type;
      if (api.readReport && innerType === 'done') {
        const reportPath = (inner as { reportPath?: string }).reportPath;
        if (reportPath) {
          void api.readReport(reportPath).then((content) => {
            if (content !== null) setReportContent(content);
          });
        }
        return;
      }
      // Audit-only — drive the live sidebar from typed events. fix/create
      // never emit these so the branch is a no-op for them.
      if (innerType === 'manifest') {
        const manifest = (inner as { manifest: AuditRun['manifest'] }).manifest;
        if (manifest) setRun((r) => ({ ...r, manifest }));
        return;
      }
      if (innerType === 'check_result') {
        const outcome = (inner as { outcome: NonNullable<AuditRun['checkResults']>[number] }).outcome;
        if (!outcome) return;
        setRun((r) => {
          const existing = r.checkResults ?? [];
          // Daemon already dedupes by checkId, but a remount + replay could
          // surface the same line twice — defend at the boundary.
          if (existing.some((o) => o.checkId === outcome.checkId)) return r;
          return { ...r, checkResults: [...existing, outcome] };
        });
        return;
      }
      // Fix-only — drive the live targets sidebar. Audit / create never
      // emit `fix_targets` so the branch is a no-op for them. Findings
      // come from the timeline (parsed from the session jsonl), not the
      // event stream.
      if (innerType === 'fix_targets') {
        const targets = (inner as { targets: NonNullable<AuditRun['targets']> }).targets;
        if (!Array.isArray(targets)) return;
        // The daemon emits the FULL reduced list each time — replace,
        // don't merge.
        setRun((r) => ({ ...r, targets }));
        return;
      }
      // Fix-only — invalidate the diff cache when the agent edits a
      // sandbox file so the open diff viewer re-fetches the new state.
      // The sandbox panel's listFixDiff subscription already refreshes
      // its file list on the same trigger.
      if (innerType === 'tool' && runKind === 'fix') {
        const name = (inner as { name?: string }).name;
        if (name && DIFF_INVALIDATING_TOOLS.has(name)) {
          invalidateSkillDiffCache(`fix:${bootedRun.runId}`);
        }
      }
      // Fix-only — an in-temp eval batch finished. Bump the timeline
      // tick so the fetch effect refetches even when the fix run is
      // paused on `waiting_for_input` / completed (the regular poll
      // is off in those states).
      if (innerType === 'fix_eval_result' && runKind === 'fix') {
        setFixTimelineTick((n) => n + 1);
      }
    },
    // Light polling at 2s keeps the screen in sync when the daemon
    // doesn't broadcast a status event (or when the IPC stop returns
    // before the runner sees it). 500ms (legacy default) caused
    // visible flicker; 0 sometimes left the UI stuck on "running"
    // after a Stop. 2000 ms is the goldilocks compromise.
    2000,
  );

  // Backfill the report on tab re-open if the run is already terminal.
  useEffect(() => {
    if (!api.readReport) return;
    if (run.status !== 'completed' || !run.reportPath || reportContent) return;
    void api.readReport(run.reportPath).then((content) => {
      if (content !== null) setReportContent(content);
    });
  }, [api, run.status, run.reportPath, reportContent]);

  // Fetch the unified timeline from Claude Code's session jsonl. Sole
  // source of truth for the chat view of fix + audit runs — every entry
  // carries its real ISO timestamp so the timeline survives a refresh
  // hours later without artificial `Date.now()` stamping.
  //
  // Polls every 1.5s while the run is RUNNING so new agent activity
  // appears within roughly the same delay as the daemon's live events
  // would have. On `waiting_for_input` / terminal we stop the timer —
  // the on-mount fetch + the status/turns effect cover the rest.
  useEffect(() => {
    const useTimeline =
      runKind === 'fix' || runKind === 'audit' || runKind === 'create';
    if (!useTimeline) {
      setFixTimeline([]);
      return;
    }
    if (!run.sessionId) {
      setFixTimeline([]);
      return;
    }
    let cancelled = false;
    const fetchOnce = () => {
      // Audit hits its own runner-backed IPC; fix and create both share
      // the fix-runner registry, so they go through `getFixTimeline`.
      const promise =
        runKind === 'audit'
          ? window.nakiros.getAuditTimeline(run.runId)
          : window.nakiros.getFixTimeline(run.runId);
      return promise
        .then((timeline) => {
          if (!cancelled) setFixTimeline(timeline);
        })
        .catch(() => {
          if (!cancelled) setFixTimeline([]);
        });
    };

    void fetchOnce();
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runKind, run.runId, run.sessionId, run.status, run.turns.length, fixTimelineTick]);

  const elapsed = useElapsedTimer(run.startedAt);
  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isCompleted = run.status === 'completed';
  const isTerminal = isCompleted || run.status === 'failed' || run.status === 'stopped';

  // Fix + audit: pull the billed-equivalent token total + agent-active timer
  // from the Claude Code session JSONL. Bypasses the runner's own token
  // tally (which drops cache_read / cache_creation today). See
  // `docs/decisions/token-accounting.md` for the policy. Eval has its own
  // batch-aggregated usage in the eval function below.
  const [fixUsage, setFixUsage] = useState<FixUsage | null>(null);
  useEffect(() => {
    if (runKind !== 'fix' && runKind !== 'audit') return;
    if (!run.sessionId) return;
    let cancelled = false;
    const fetchOnce = () => {
      const promise =
        runKind === 'audit'
          ? window.nakiros.getAuditUsage(run.runId)
          : window.nakiros.getFixUsage(run.runId);
      return promise
        .then((u) => {
          if (!cancelled) setFixUsage(u);
        })
        .catch(() => {
          // best-effort — header just falls back to the legacy `run.tokensUsed`
        });
    };
    void fetchOnce();
    // Poll while the agent could still emit turns. When the run is
    // waiting_for_input or terminal, one fetch on mount is enough — the
    // session JSONL is closed for new assistant turns until the user
    // sends a message (which flips status back to running, restarting
    // the poll via the dependency on `run.status`).
    const isLive = run.status === 'running' || run.status === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runKind, run.runId, run.sessionId, run.status]);

  const [isStopping, setIsStopping] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isLaunchingEval, setIsLaunchingEval] = useState(false);

  // Eval-diff overlay state — opened when the user clicks `[diff >]` on an
  // eval_result card in the fix timeline. The matrix is lazy-loaded.
  const [evalDiffResult, setEvalDiffResult] = useState<FixEvalResult | null>(null);
  const [evalDiffMatrix, setEvalDiffMatrix] = useState<EvalMatrix | null>(null);
  const [evalDiffFixTempOffset, setEvalDiffFixTempOffset] = useState<number | null>(null);

  const fixDiffIdentity = useMemo<RunScreenIdentity | null>(() => {
    if (runKind !== 'fix') return null;
    return {
      scope: run.scope,
      skillName: run.skillName,
      projectId: run.projectId,
      pluginName: run.pluginName,
      marketplaceName: run.marketplaceName,
    };
  }, [runKind, run.scope, run.skillName, run.projectId, run.pluginName, run.marketplaceName]);

  // Lazy-fetch the matrix the first time the diff overlay is opened.
  // Fetches BOTH the prod matrix and this fix session's `.fix-temp/`
  // matrix in parallel, then merges them so the picker can offer prod
  // and fix-temp iterations side-by-side. Fix-temp iter numbers are
  // re-mapped (raw + offset) to avoid collisions with prod iter numbers,
  // since each fix session restarts the counter at 1.
  useEffect(() => {
    if (!evalDiffResult || !fixDiffIdentity) return;
    if (evalDiffMatrix) return;
    let cancelled = false;
    void Promise.all([
      window.nakiros.getEvalMatrix(matrixRequestFromIdentity(fixDiffIdentity)),
      window.nakiros.getFixTempMatrix(run.runId).catch(() => null),
    ])
      .then(([prod, fixTemp]) => {
        if (cancelled) return;
        const merged = mergeFixTempIntoProdMatrix(prod as EvalMatrix, fixTemp);
        setEvalDiffMatrix(merged.matrix);
        setEvalDiffFixTempOffset(merged.fixTempOffset);
      })
      .catch(() => {
        // swallow — overlay just won't open if the matrix can't be fetched
      });
    return () => {
      cancelled = true;
    };
  }, [evalDiffResult, fixDiffIdentity, evalDiffMatrix, run.runId]);

  const fixDiffSkillStub: Skill = useMemo(
    () => stubSkillFor(fixDiffIdentity),
    [fixDiffIdentity],
  );

  // Map the daemon's kind-specific status enum onto AgentRunStatus
  // (`pending` / `running` / `awaiting_input` / `done` / `failed` /
  // `cancelled`) so `NewRunHeader` always speaks the unified language.
  const status = mapAuditStatus(run.status);

  async function handleStop() {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await api.actions.stop(run.runId);
      // Pull the updated status immediately — the runner may take a
      // beat to broadcast a `status: stopped` event, and we don't
      // want the user to keep staring at a "Stopping…" spinner.
      const fresh = await api.state.getRun(run.runId);
      if (fresh) setRun(fresh);
    } catch (err) {
      console.error('[run] stop failed', err);
    } finally {
      setIsStopping(false);
    }
  }

  async function handleSend(message: string) {
    await api.actions.sendUserMessage(run.runId, message);
  }

  async function handleFinish() {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await api.actions.finish(run.runId);
      agentRunStore.dismiss(run.runId);
      onClose();
    } catch (err) {
      console.error('[run] finish failed', err);
      setIsFinishing(false);
    }
  }

  async function handleLaunchEval() {
    if (isLaunchingEval || !onOpenRunTab) return;
    setIsLaunchingEval(true);
    try {
      await launchFixEval(run, onOpenRunTab);
    } catch (err) {
      console.error('[run] launchFixEval failed', err);
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

  async function handleReject() {
    if (isRejecting) return;
    const message =
      runKind === 'create'
        ? t('prompts.rejectCreate', {
            defaultValue:
              'Discard the sandbox? The skill draft will be thrown away.',
          })
        : t('prompts.rejectFix', {
            defaultValue:
              'Discard the sandbox? The pending changes will be thrown away.',
          });
    if (!window.confirm(message)) return;
    setIsRejecting(true);
    try {
      await api.actions.stop(run.runId);
      agentRunStore.dismiss(run.runId);
      onClose();
    } catch (err) {
      console.error('[run] reject failed', err);
      setIsRejecting(false);
    }
  }

  // Header stats. Fix and audit surface the **billed-equivalent** tokens +
  // agent-active elapsed parsed from the session JSONL (see
  // `docs/decisions/token-accounting.md`). Create still uses the legacy
  // `run.tokensUsed` + wall-clock elapsed until it migrates.
  const stats: Array<{ label: string; value: string }> = [];
  const useSessionUsage = (runKind === 'fix' || runKind === 'audit') && fixUsage;
  if (useSessionUsage) {
    stats.push({ label: 'Tokens', value: formatTokens(fixUsage.billedEquivalent) });
    // While the agent is generating, tick from the run's startedAt-anchored
    // base by adding (now − last_user_ts) on top of the already-frozen
    // intervals from prior turns. When waiting / terminal, the JSONL
    // already closed the last interval — display the frozen sum.
    let displayMs = fixUsage.agentActiveMs;
    if (isRunning && fixUsage.lastUserMessageAt) {
      const delta = Date.now() - new Date(fixUsage.lastUserMessageAt).getTime();
      if (Number.isFinite(delta) && delta > 0) displayMs += delta;
    }
    stats.push({ label: 'Elapsed', value: formatDuration(displayMs) });
  } else {
    if (run.tokensUsed != null) {
      stats.push({ label: 'Tokens', value: formatTokens(run.tokensUsed) });
    }
    stats.push({
      label: 'Elapsed',
      value: formatDuration(isTerminal ? run.durationMs ?? 0 : elapsed),
    });
  }

  // Audit progress — drives the "step X/Y" caption in the header. We only
  // know the total once the manifest has been emitted; until then the bar
  // stays hidden (no fake percentage).
  const auditStepTotal =
    runKind === 'audit' && run.manifest ? run.manifest.totalChecks : undefined;
  const auditStepDone =
    runKind === 'audit' && run.manifest ? run.checkResults?.length ?? 0 : undefined;

  // Audit gets a dedicated completion screen (hero card + KPIs + findings +
  // next steps). Fix / create keep the markdown viewer fallback.
  const showAuditCompleted = runKind === 'audit' && isCompleted;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
      <NewRunHeader
        kind={runKind}
        status={status}
        title={composeTitle(runKind, run, t)}
        stats={stats}
        onBack={onClose}
        onStop={isRunning ? handleStop : undefined}
        onFinish={isCompleted ? handleFinish : undefined}
        isStopping={isStopping}
        stepTotal={auditStepTotal}
        stepDone={auditStepDone}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas">
          {showAuditCompleted ? (
            <AuditCompletedReport
              run={run}
              reportContent={reportContent}
              onOpenReport={
                run.reportPath
                  ? () => void window.nakiros.openPath(run.reportPath as string)
                  : undefined
              }
              onOpenRunTab={onOpenRunTab}
            />
          ) : isCompleted && reportContent ? (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-[920px] rounded-n-lg border border-n-border-subtle bg-n-surface px-6 py-5">
                <AuditMarkdownViewer content={reportContent} />
              </div>
            </div>
          ) : runKind === 'fix' && selectedDiffFile ? (
            <FixFileDiffView
              runId={run.runId}
              relativePath={selectedDiffFile}
              cacheScope={diffCacheScope}
              onBack={() => setSelectedDiffFile(null)}
            />
          ) : (
            <RunStream
              turns={run.turns}
              liveEvents={liveEvents}
              isStreaming={isRunning}
              timeline={
                runKind === 'fix' || runKind === 'audit' ? fixTimeline : undefined
              }
              onOpenEvalDiff={runKind === 'fix' ? setEvalDiffResult : undefined}
              skillName={runKind === 'fix' ? run.skillName : undefined}
            />
          )}

          <RunErrorBanner message={run.error ?? handlerError} />
          {isWaiting && <HumanInteractionPanel isWaiting onSend={handleSend} />}
        </div>

        <RunSidePanel
          kind={runKind}
          run={run}
          reportContent={reportContent}
          onReject={runKind === 'fix' ? handleReject : undefined}
          isRejecting={isRejecting}
          // Apply/Finish: surfaces the green "Apply & deploy" button in the
          // FixPanel. The handler chain (`handleFinish` → `api.actions.finish`
          // → `fix:finish` → `runner.finish` → `spec.cleanupOnTerminal` →
          // `cleanupRunWorkdir`) takes care of the sync-back, the
          // fix-temp-iteration promotion, the tmp workdir teardown AND the
          // matching `~/.claude/projects/<encoded>/` entry deletion.
          onFinish={runKind === 'fix' ? handleFinish : undefined}
          isFinishing={isFinishing}
          selectedDiffFile={runKind === 'fix' ? selectedDiffFile : null}
          onSelectDiffFile={runKind === 'fix' ? setSelectedDiffFile : undefined}
          onLaunchEval={runKind === 'fix' && onOpenRunTab ? handleLaunchEval : undefined}
          isLaunchingEval={isLaunchingEval}
        />
      </div>

      {evalDiffResult && fixDiffIdentity && evalDiffMatrix && (
        <EvalDiffOverlay
          matrix={evalDiffMatrix}
          skill={fixDiffSkillStub}
          // Fix-temp iters are stored in the merged matrix at their
          // re-mapped index (`raw + offset`). The encart click reports
          // the raw fix-temp iter number, so we shift it here so the
          // overlay seeds the correct row.
          initialIteration={
            evalDiffFixTempOffset !== null
              ? evalDiffResult.iteration + evalDiffFixTempOffset
              : evalDiffResult.iteration
          }
          baseRequest={matrixRequestFromIdentity(fixDiffIdentity)}
          fixRunId={run.runId}
          fixTempOffset={evalDiffFixTempOffset ?? undefined}
          onClose={() => {
            setEvalDiffResult(null);
            // Reset the cached matrix so the next open refetches both
            // prod and fix-temp (the user may have run new evals
            // between two diff openings).
            setEvalDiffMatrix(null);
            setEvalDiffFixTempOffset(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Merge a fix session's `.fix-temp/` matrix into the prod matrix so the diff
 * overlay can offer prod and fix-temp iterations side-by-side. Each fix
 * session's iteration counter restarts at 1, so we re-map fix-temp iter
 * numbers by adding `prodMaxIter + 1` (or 1 if no prod history). The
 * resulting `fixTempOffset` is passed to the overlay so it can render
 * "fix N" labels and route the assertion drilldown to the right backend
 * path via `fixRunId`.
 *
 * Returns `{ matrix: prod, fixTempOffset: null }` when there's nothing to
 * merge (no fix-temp iters yet).
 */
function mergeFixTempIntoProdMatrix(
  prod: EvalMatrix,
  fixTemp: EvalMatrix | null,
): { matrix: EvalMatrix; fixTempOffset: number | null } {
  if (!fixTemp || fixTemp.iterations.length === 0) {
    return { matrix: prod, fixTempOffset: null };
  }
  const prodMaxIter = prod.iterations.length > 0 ? Math.max(...prod.iterations) : 0;
  const fixTempOffset = prodMaxIter; // fix-temp iter 1 → display index `prodMax + 1`
  const remappedIterations = fixTemp.iterations.map((n) => n + fixTempOffset);

  // Per-eval row stitching: union of evalNames from both matrices, with
  // null cells where one side didn't have the eval at all (matches the
  // "introduced at iter N" pattern from the prod matrix).
  const evalNames = new Set<string>([
    ...prod.rows.map((r) => r.evalName),
    ...fixTemp.rows.map((r) => r.evalName),
  ]);
  const prodRowByName = new Map(prod.rows.map((r) => [r.evalName, r]));
  const fixRowByName = new Map(fixTemp.rows.map((r) => [r.evalName, r]));
  const mergedRows = Array.from(evalNames)
    .sort()
    .map((evalName) => {
      const prodRow = prodRowByName.get(evalName);
      const fixRow = fixRowByName.get(evalName);
      const padNulls = (count: number) => Array.from({ length: count }, () => null);
      return {
        evalName,
        withSkill: [
          ...(prodRow?.withSkill ?? padNulls(prod.iterations.length)),
          ...(fixRow?.withSkill ?? padNulls(fixTemp.iterations.length)),
        ],
        withoutSkill: [
          ...(prodRow?.withoutSkill ?? padNulls(prod.iterations.length)),
          ...(fixRow?.withoutSkill ?? padNulls(fixTemp.iterations.length)),
        ],
        // Tags describe behaviour over the prod history; if the eval only
        // existed in the fix-temp matrix, fall back to the fix-temp tag,
        // otherwise default to a neutral `stable` (the diff overlay only
        // uses tags for the matrix grid header counts, not for picker UI).
        tag: prodRow?.tag ?? fixRow?.tag ?? { kind: 'stable' as const, variance: 0 },
      };
    });

  const matrix: EvalMatrix = {
    skillName: prod.skillName,
    iterations: [...prod.iterations, ...remappedIterations],
    fingerprints: [...prod.fingerprints, ...fixTemp.fingerprints],
    models: [...prod.models, ...fixTemp.models],
    kinds: [...prod.kinds, ...fixTemp.kinds],
    rows: mergedRows,
    metrics: {
      iterations: [...prod.iterations, ...remappedIterations],
      passRateByIteration: [
        ...prod.metrics.passRateByIteration,
        ...fixTemp.metrics.passRateByIteration,
      ],
      tokensByIteration: [
        ...prod.metrics.tokensByIteration,
        ...fixTemp.metrics.tokensByIteration,
      ],
      tagCounts: prod.metrics.tagCounts,
    },
  };
  return { matrix, fixTempOffset };
}

/**
 * Tool names that mutate the sandbox tree. When one fires we drop the diff
 * cache so any open `FixFileDiffView` re-fetches the new content. Mirrors
 * `WRITE_TOOLS` in `RunSidePanel.tsx` — kept in sync.
 */
const DIFF_INVALIDATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * Renders the side-by-side diff body for one sandbox file, with a sticky
 * header that exposes a Back button to return to the conversation. Reuses
 * `FileDiffPanel` for the actual diff rendering and the existing legacy
 * fix-runner `readFixDiffFile` IPC for content.
 */
function FixFileDiffView({
  runId,
  relativePath,
  cacheScope,
  onBack,
}: {
  runId: string;
  relativePath: string;
  cacheScope: string;
  onBack(): void;
}) {
  const { t } = useTranslation('runs');
  const { t: tFix } = useTranslation('fix');

  const fetchDiff = useMemo(
    () =>
      async (path: string): Promise<SkillDiffFileContent> => {
        const payload: SkillDiffFilePayload = await window.nakiros.readFixDiffFile(runId, path);
        return {
          originalContent: payload.originalContent,
          modifiedContent: payload.modifiedContent,
          isBinary: payload.isBinary,
        };
      },
    [runId],
  );

  const labels: SkillDiffLabels = {
    filesPanelTitle: '',
    originalColumn: tFix('review.originalColumn', { defaultValue: 'Original' }),
    modifiedColumn: tFix('review.modifiedColumn', { defaultValue: 'Sandbox' }),
    missingFile: tFix('review.missingFile', { defaultValue: '(missing)' }),
    binaryNotice: tFix('review.binaryNotice', { defaultValue: 'Binary file — diff hidden.' }),
    identicalNotice: tFix('review.identicalNotice', {
      defaultValue: 'Files are identical.',
    }),
    loading: tFix('review.diffLoading', { defaultValue: 'Loading diff…' }),
    errorTemplate: (message) =>
      tFix('review.diffFailed', { defaultValue: 'Diff failed: {{message}}', message }),
    emptyState: '',
    sideOriginalOnly: tFix('review.sideRemoved', { defaultValue: 'removed' }),
    sideModifiedOnly: tFix('review.sideAdded', { defaultValue: 'added' }),
    sideBoth: tFix('review.sideModified', { defaultValue: 'modified' }),
    addedLinesLabel: (count) =>
      tFix('review.addedLines', { defaultValue: '+{{count}}', count }),
    removedLinesLabel: (count) =>
      tFix('review.removedLines', { defaultValue: '−{{count}}', count }),
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-n-border-subtle bg-n-surface px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1 font-n-mono text-[11px] text-n-muted transition-colors hover:border-n-border-default hover:bg-n-sunken hover:text-n-fg"
        >
          <ArrowLeft size={11} strokeWidth={2.25} />
          {t('diff.backToChat', { defaultValue: 'Back to conversation' })}
        </button>
        <span
          className="min-w-0 flex-1 truncate font-n-mono text-[12px] text-n-fg"
          title={relativePath}
        >
          {relativePath}
        </span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <FileDiffPanel
          relativePath={relativePath}
          fetchDiff={fetchDiff}
          labels={labels}
          cacheScope={cacheScope}
        />
      </div>
    </div>
  );
}

// ── Eval (batch) — Phase 4 PR9b ────────────────────────────────────────────

/**
 * Renders an aggregated eval run. Each AgentRun of `kind: 'eval'` is
 * actually a *batch* of `SkillEvalRun` instances sharing
 * `(skill, iteration)` — the agent run store carries the underlying
 * runIds in `agentRun.meta`. We resolve those into the matching
 * SkillEvalRun objects via `listEvalRuns()` so the body can render
 * one row per eval × config.
 *
 * No chat / turns: SkillEvalRun has its own `turns[]` per run, but
 * with up to `definitions × 2 (with-skill + baseline)` runs in a
 * single batch the linear stream pattern doesn't make sense here —
 * we surface a status dashboard instead.
 */
function EvalRunScreen({
  runId,
  onClose,
  onOpenRunTab,
}: {
  runId: string;
  onClose(): void;
  onOpenRunTab?: import('../lib/run-launcher').OpenRunTabCallback;
}) {
  const { t } = useTranslation('runs');
  const agentRun = useAgentRunFromStore(runId);
  // All hooks must be declared up-front to satisfy rules-of-hooks —
  // an early return when `agentRun` is still pending used to skip the
  // `isStopping` state, which made React throw error #310 on the next
  // render once the store snapshot landed.
  const [evalRuns, setEvalRuns] = useState<SkillEvalRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-run event buckets — each SkillEvalRun has its own conversation,
  // and the user can switch between with-skill / baseline (or different
  // evalNames) via the side panel. Mixing every run's stream into one
  // chat made it impossible to read or to respond to a `waiting_for_input`
  // request that targeted a specific runner.
  const [eventsByRun, setEventsByRun] = useState<Record<string, LiveStreamEvent[]>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  // Bumped on every per-run status event so the side panel reflects
  // each runner finishing — without this the list only refreshed when
  // the *batch-level* AgentRun status flipped (i.e. once at the very
  // end), and the queue stayed visually stuck while runs completed.
  const [refreshTick, setRefreshTick] = useState(0);
  // Diff overlay state — set when the user clicks "Voir le diff" from
  // the recap. We lazy-fetch the matrix the first time it's needed.
  const [diffIteration, setDiffIteration] = useState<number | null>(null);
  const [diffMatrix, setDiffMatrix] = useState<EvalMatrix | null>(null);
  const [diffFixTempOffset, setDiffFixTempOffset] = useState<number | null>(null);
  // Batch-aggregated billed-equivalent tokens + agent-active timer for
  // the header stats. Sums every iteration's session JSONL — see
  // `docs/decisions/token-accounting.md`. The legacy `aggregated.tokens`
  // (sum of `tokensUsed` per run) drops cache_read / cache_creation, so
  // we surface this when available and only fall back to the legacy
  // sum during the brief window before the first poll resolves.
  const [batchUsage, setBatchUsage] = useState<FixUsage | null>(null);
  // Per-iteration timeline derived from the selected iteration's session
  // jsonl — single source of truth, same pattern as fix/audit. Hoisted
  // alongside the other useStates because React's hook order has to be
  // stable across renders (the early-return on `!agentRun` below would
  // skip this state otherwise → React error #310).
  const [evalTimeline, setEvalTimeline] = useState<ChatTimelineEntry[]>([]);

  const runIds = useMemo(() => {
    if (agentRun?.meta?.kind === 'eval') return agentRun.meta.runIds;
    return [];
  }, [agentRun]);
  const runIdsKey = runIds.join(',');

  // Refetch the SkillEvalRun list whenever the batch composition
  // changes, the AgentRun status changes, or any per-run status event
  // bumps `refreshTick` (so individual runs ticking from running →
  // completed update the side panel immediately).
  useEffect(() => {
    let cancelled = false;
    if (runIds.length === 0) {
      setEvalRuns([]);
      return;
    }
    setLoadError(null);
    void window.nakiros
      .listEvalRuns()
      .then((all) => {
        if (cancelled) return;
        const ids = new Set(runIds);
        setEvalRuns(all.filter((r) => ids.has(r.runId)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdsKey, agentRun?.status, refreshTick]);

  // Fetch the batch-aggregated billed-equivalent + agent-active stats
  // by summing every iteration's session JSONL. Polls 1.5s while any
  // run in the batch could still emit turns; one fetch on settle is
  // enough to capture the final totals.
  useEffect(() => {
    if (runIds.length === 0) {
      setBatchUsage(null);
      return;
    }
    let cancelled = false;
    const fetchOnce = () =>
      window.nakiros
        .getEvalBatchUsage(runIds)
        .then((u) => {
          if (!cancelled) setBatchUsage(u);
        })
        .catch(() => {
          // best-effort — header just falls back to the legacy aggregated tokens
        });
    void fetchOnce();
    const isLive = agentRun?.status === 'running' || agentRun?.status === 'pending';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdsKey, agentRun?.status]);

  // Replay the buffered events for every run in the batch on mount,
  // then subscribe to the live event channel filtered by `runIds`. We
  // bucket events under their owning runId so the chat below can render
  // a single run's conversation at a time (chosen via the side panel).
  useEffect(() => {
    if (runIds.length === 0) return;
    let cancelled = false;
    const ids = new Set(runIds);

    void Promise.all(
      runIds.map((id) =>
        window.nakiros.getEvalBufferedEvents(id).then((events) => [id, events] as const),
      ),
    ).then((perRun) => {
      if (cancelled) return;
      const initial: Record<string, LiveStreamEvent[]> = {};
      const now = Date.now();
      for (const [id, events] of perRun) {
        const bucket: LiveStreamEvent[] = [];
        for (const ev of events) {
          if (ev.type === 'text') {
            bucket.push({ type: 'text', text: (ev as { text: string }).text, ts: now });
          } else if (ev.type === 'tool') {
            const tool = ev as { name: string; display: string };
            bucket.push({ type: 'tool', name: tool.name, display: tool.display, ts: now });
          }
        }
        initial[id] = bucket;
      }
      setEventsByRun(initial);
    });

    const unsubscribe = window.nakiros.onEvalEvent(({ runId: id, event }) => {
      if (!ids.has(id)) return;
      if (event.type === 'text') {
        const text = (event as { text: string }).text;
        setEventsByRun((prev) => ({
          ...prev,
          [id]: [...(prev[id] ?? []), { type: 'text', text, ts: Date.now() }],
        }));
      } else if (event.type === 'tool') {
        const tool = event as { name: string; display: string };
        setEventsByRun((prev) => ({
          ...prev,
          [id]: [
            ...(prev[id] ?? []),
            { type: 'tool', name: tool.name, display: tool.display, ts: Date.now() },
          ],
        }));
      } else if (event.type === 'status') {
        const status = (event as { status: string }).status;
        if (status === 'starting') {
          setEventsByRun((prev) => ({ ...prev, [id]: [] }));
        }
        // Pull a fresh SkillEvalRun list — counts, queue dots, delta
        // chip all derive from it.
        setRefreshTick((n) => n + 1);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdsKey]);

  // Auto-select a sensible run on first load and whenever a runner
  // requests user input — `waiting_for_input` always wins so the user
  // sees the runner that needs them next; otherwise we fall back to
  // the running run, then the first run in the batch.
  useEffect(() => {
    if (!evalRuns || evalRuns.length === 0) return;
    const waiting = evalRuns.find((r) => r.status === 'waiting_for_input');
    if (waiting) {
      setSelectedRunId(waiting.runId);
      return;
    }
    if (selectedRunId && evalRuns.some((r) => r.runId === selectedRunId)) return;
    const running = evalRuns.find((r) => r.status === 'running' || r.status === 'starting');
    setSelectedRunId((running ?? evalRuns[0]).runId);
  }, [evalRuns, selectedRunId]);

  // ── Diff overlay plumbing ─────────────────────────────────────────────
  // Reuses `EvalDiffOverlay` (matrix view's compare screen) so the recap's
  // "Voir le diff vs run précédent" lands on the same UI as the matrix's.
  // These hooks MUST live before any early-return so React sees the same
  // hook order on every render (rules-of-hooks; otherwise we hit error
  // #310 the first time `agentRun` lands and the component switches from
  // the loading branch to the body branch).
  const diffIdentity = useMemo<RunScreenIdentity | null>(() => {
    if (!agentRun) return null;
    return identityFromAgentRun(agentRun, evalRuns);
  }, [agentRun, evalRuns]);

  // If this batch was launched from a fix session (every run carries the
  // parent `fixRunId`), grab it so the diff overlay can also fetch the
  // fix-temp matrix and surface fix-temp iters next to prod ones.
  const evalBatchFixRunId = useMemo<string | null>(() => {
    if (!evalRuns || evalRuns.length === 0) return null;
    return evalRuns[0]?.fixRunId ?? null;
  }, [evalRuns]);

  // Lazy-fetch the matrix the first time the user opens the diff overlay.
  // When the batch came from a fix run, fetch BOTH the prod matrix and
  // the fix session's `.fix-temp/` matrix in parallel and merge them so
  // the picker offers prod and fix-temp iters side-by-side. The
  // remap-by-offset trick mirrors `RunScreen` for the fix chat path.
  useEffect(() => {
    if (diffIteration === null) return;
    if (diffMatrix) return;
    if (!diffIdentity) return;
    let cancelled = false;
    void Promise.all([
      window.nakiros.getEvalMatrix(matrixRequestFromIdentity(diffIdentity)),
      evalBatchFixRunId
        ? window.nakiros.getFixTempMatrix(evalBatchFixRunId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([prod, fixTemp]) => {
        if (cancelled) return;
        const merged = mergeFixTempIntoProdMatrix(prod as EvalMatrix, fixTemp);
        setDiffMatrix(merged.matrix);
        setDiffFixTempOffset(merged.fixTempOffset);
      })
      .catch(() => {
        // swallow — overlay just won't open if the matrix can't be fetched
      });
    return () => {
      cancelled = true;
    };
  }, [diffIteration, diffMatrix, diffIdentity, evalBatchFixRunId]);

  // EvalDiffOverlay reads `skill.evals.iterations` for timestamps. We don't
  // have the full Skill record on this screen — pass an empty stub so the
  // overlay renders without timestamps. Acceptable for the recap entry
  // point; users get the same diff via the matrix view with full data.
  const diffSkillStub: Skill = useMemo(
    () => stubSkillFor(diffIdentity),
    [diffIdentity],
  );

  // Resolve the currently selected iteration. Hoisted above the early
  // return because the timeline-fetch effect below depends on its fields
  // — useEffect must always run in the same order on every render.
  const selectedRun =
    (evalRuns ?? []).find((r) => r.runId === selectedRunId) ?? (evalRuns ?? [])[0] ?? null;
  const selectedEvalRunId = selectedRun?.runId ?? null;
  const selectedEvalSessionId = selectedRun?.sessionId ?? null;
  const selectedEvalStatus = selectedRun?.status ?? null;

  // Fetch the selected iteration's timeline from its session jsonl.
  // Switching iterations clears the previous timeline immediately so
  // the chat doesn't flash the wrong run while the new fetch resolves.
  // Until the run captures a `sessionId` (still queued / first turn
  // before claude responds), the consumer falls back to the legacy
  // `turns` + live event path so the chat isn't empty during the very
  // first seconds.
  useEffect(() => {
    setEvalTimeline([]);
    if (!selectedEvalRunId || !selectedEvalSessionId) return;
    let cancelled = false;
    const fetchOnce = () =>
      window.nakiros
        .getEvalTimeline(selectedEvalRunId)
        .then((tl) => {
          if (!cancelled) setEvalTimeline(tl);
        })
        .catch(() => {
          if (!cancelled) setEvalTimeline([]);
        });
    void fetchOnce();
    const isLive =
      selectedEvalStatus === 'running' || selectedEvalStatus === 'starting';
    const timer = isLive ? setInterval(fetchOnce, 1500) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [selectedEvalRunId, selectedEvalSessionId, selectedEvalStatus]);

  if (!agentRun) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
        <NewRunHeader kind="eval" status="pending" title={runId} onBack={onClose} />
        <div className="px-7 py-6 font-n-mono text-[12px] text-n-muted">
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      </div>
    );
  }

  // Aggregated counters from the live eval runs (or AgentRun snapshot
  // before the per-run list lands).
  const aggregated = aggregateEvalRuns(evalRuns ?? []);
  const passed = aggregated.passed;
  const total = aggregated.total;

  const tokensValue =
    batchUsage?.billedEquivalent ?? aggregated.tokens ?? agentRun.tokensUsed ?? 0;

  const stats: Array<{ label: string; value: string }> = [
    {
      label: t('panels.eval.passed', { defaultValue: 'Passed' }),
      value: total > 0 ? `${passed}/${total}` : '—',
    },
    {
      label: t('panels.eval.tokens', { defaultValue: 'Tokens' }),
      value: formatTokens(tokensValue),
    },
  ];
  if (batchUsage) {
    stats.push({
      label: t('panels.eval.elapsed', { defaultValue: 'Elapsed' }),
      value: formatDuration(batchUsage.agentActiveMs),
    });
  }

  const isRunning = agentRun.status === 'running' || agentRun.status === 'pending';
  // Batch is "settled" when no run is still in flight — covers `done`
  // (every run completed) AND `failed` / `cancelled` (some runs failed
  // or were stopped). The recap UI is meaningful in all three cases:
  // the user wants to see the per-eval breakdown regardless of whether
  // the batch was 100% successful.
  const isSettled =
    agentRun.status === 'done' ||
    agentRun.status === 'failed' ||
    agentRun.status === 'cancelled';

  const finishedCount = (evalRuns ?? []).filter(
    (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'stopped',
  ).length;

  // `selectedRun` was already derived above the early return; here we
  // just resolve its event bucket. Kept inline because `eventsByRun`
  // is the only state needed and the lookup is trivial.
  const selectedEvents = selectedRun ? eventsByRun[selectedRun.runId] ?? [] : [];

  const handleEvalStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await Promise.allSettled(
        runIds.map((id) => window.nakiros.stopEvalRun(id)),
      );
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
      <NewRunHeader
        kind="eval"
        status={agentRun.status}
        title={agentRun.title}
        stats={stats}
        onBack={onClose}
        onStop={isRunning ? handleEvalStop : undefined}
        onFinish={
          isSettled
            ? () => {
                for (const id of runIds) {
                  void window.nakiros.finishEvalRun(id).catch(() => undefined);
                }
                agentRunStore.dismiss(runId);
                onClose();
              }
            : undefined
        }
        isStopping={isStopping}
        stepDone={finishedCount}
        stepTotal={runIds.length}
      />

      <div className="flex flex-1 overflow-hidden">
        {isSettled ? (
          // Recap takes over the full viewport once every run in the batch
          // has reached a terminal state — done / failed / cancelled. It
          // pulls its own data (matrix + baselines + assertions per row)
          // and exposes the next-step actions (View diff, Fix regression,
          // Re-run on untested model).
          <EvalRunRecap
            agentRun={agentRun}
            runs={evalRuns ?? []}
            onOpenDiff={(iter) => setDiffIteration(iter)}
            onOpenRunTab={onOpenRunTab}
          />
        ) : (
          <>
            <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas">
              {loadError && (
                <div className="m-4 rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
                  {loadError}
                </div>
              )}
              {selectedRun && <EvalRunHeader selected={selectedRun} />}
              <RunStream
                // Persisted turns from `run.json` are only used as fallback
                // while the timeline hasn't landed yet (still queued / first
                // turn pre-sessionId). Once the iteration's session jsonl
                // exists, the `timeline` prop takes over and these are
                // ignored — same model as fix and audit.
                turns={selectedRun?.turns ?? []}
                liveEvents={selectedEvents}
                isStreaming={
                  isRunning &&
                  !!selectedRun &&
                  (selectedRun.status === 'running' || selectedRun.status === 'starting')
                }
                timeline={evalTimeline.length > 0 ? evalTimeline : undefined}
              />

              {selectedRun?.status === 'waiting_for_input' && (
                <HumanInteractionPanel
                  isWaiting
                  onSend={(message) =>
                    window.nakiros.sendEvalUserMessage(selectedRun.runId, message)
                  }
                />
              )}
            </div>
            <EvalSidePanel
              agentRun={agentRun}
              runs={evalRuns ?? []}
              selectedRunId={selectedRun?.runId ?? null}
              onSelect={(runId) => setSelectedRunId(runId)}
            />
          </>
        )}
      </div>

      {diffIteration !== null && diffIdentity && diffMatrix && (
        <EvalDiffOverlay
          matrix={diffMatrix}
          skill={diffSkillStub}
          // The recap reports the raw iteration number (per-fix-session
          // counter when this batch came from a fix). The merged matrix
          // stores fix-temp iters at index `raw + fixTempOffset` to avoid
          // collisions, so we shift here when applicable.
          initialIteration={
            evalBatchFixRunId !== null && diffFixTempOffset !== null
              ? diffIteration + diffFixTempOffset
              : diffIteration
          }
          baseRequest={matrixRequestFromIdentity(diffIdentity)}
          fixRunId={evalBatchFixRunId ?? undefined}
          fixTempOffset={diffFixTempOffset ?? undefined}
          onClose={() => {
            setDiffIteration(null);
            // Reset the cached matrix so a re-open refetches both prod
            // and fix-temp (the user may have run new evals between two
            // openings).
            setDiffMatrix(null);
            setDiffFixTempOffset(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Strip above the chat that surfaces the currently focused run. Since
 * iterations are now mono-config (a normal eval iteration runs only
 * with_skill — the baseline lives in the per-model cache; a baseline-only
 * run runs only without_skill), there's no sibling to toggle to: the
 * header just labels the run.
 */
function EvalRunHeader({ selected }: { selected: SkillEvalRun }) {
  const { t } = useTranslation('runs');
  const tone = evalStatusTone(selected.status);
  const selectedLabel =
    selected.config === 'with_skill'
      ? t('panels.eval.withSkill', { defaultValue: 'With skill' })
      : t('panels.eval.baseline', { defaultValue: 'Baseline' });
  return (
    <div className="flex items-center justify-between gap-3 border-b border-n-border-subtle bg-n-surface px-6 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + (tone.pulse ? 'n-pulse' : '')}
          style={{ background: tone.color }}
        />
        <span className="truncate font-n-mono text-[12px] text-n-fg" title={selected.evalName}>
          {selected.evalName}
        </span>
        <span className="font-n-mono text-[10.5px] uppercase tracking-[0.6px] text-n-faint">
          · {selectedLabel}
        </span>
      </div>
    </div>
  );
}

function EvalSidePanel({
  agentRun,
  runs,
  selectedRunId,
  onSelect,
}: {
  agentRun: AgentRun;
  runs: SkillEvalRun[];
  selectedRunId: string | null;
  onSelect(runId: string): void;
}) {
  const { t } = useTranslation('runs');
  const iteration = agentRun.meta?.kind === 'eval' ? agentRun.meta.iteration : null;
  const aggregated = aggregateEvalRuns(runs);
  const passRate = aggregated.total > 0 ? aggregated.passed / aggregated.total : null;
  const groupedByEval = useMemo(() => {
    const map = new Map<string, SkillEvalRun[]>();
    for (const run of runs) {
      const list = map.get(run.evalName) ?? [];
      list.push(run);
      map.set(run.evalName, list);
    }
    return Array.from(map.entries());
  }, [runs]);
  // Progression: count runs that have reached a terminal state, regardless
  // of pass/fail. Mirrors the "3/6" mockup widget.
  const finishedCount = runs.filter(
    (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'stopped',
  ).length;
  const progressPct = runs.length > 0 ? Math.round((finishedCount / runs.length) * 100) : 0;
  const elapsed = useElapsedTimer(agentRun.startedAt);

  // Pass-rate split between with-skill / baseline so we can surface
  // the skill value directly in the panel.
  const withSkill = runs.filter((r) => r.config === 'with_skill');
  const baseline = runs.filter((r) => r.config === 'without_skill');
  const withSkillRate =
    withSkill.length > 0
      ? aggregateEvalRuns(withSkill).passed / Math.max(aggregateEvalRuns(withSkill).total, 1)
      : null;
  const baselineRate =
    baseline.length > 0
      ? aggregateEvalRuns(baseline).passed / Math.max(aggregateEvalRuns(baseline).total, 1)
      : null;
  const delta =
    withSkillRate !== null && baselineRate !== null ? withSkillRate - baselineRate : null;

  // Delta uplift: counts how many evals improved with-skill vs baseline.
  const upliftStats = useMemo(() => computeUplift(groupedByEval), [groupedByEval]);

  return (
    <aside className="flex w-[320px] flex-shrink-0 flex-col overflow-hidden border-l border-n-border-subtle bg-n-surface">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          {/* Progression */}
          <section>
            <div className="mb-2 font-n-mono text-[10px] uppercase tracking-[1.2px] text-n-subtle">
              {t('panels.eval.progression', { defaultValue: 'Progression' })}
            </div>
            <div className="rounded-n-md border border-n-border-subtle bg-n-canvas p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-n-mono text-[28px] font-medium leading-none tabular-nums text-n-fg">
                  {finishedCount}
                  <span className="text-n-faint">/{runs.length}</span>
                </span>
                <span className="font-n-mono text-[11px] text-n-faint">
                  {formatDuration(elapsed)} elapsed
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-n-sunken">
                <div
                  className="h-full bg-n-accent transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {iteration !== null && (
                <div className="mt-2 font-n-mono text-[10.5px] text-n-faint">
                  {withSkill.length === 0
                    ? t('panels.eval.runningBaselineOnly', {
                        defaultValue: 'baseline recompute · without-skill ▽',
                      })
                    : (
                      <>
                        iter {iteration} ·{' '}
                        {baseline.length > 0
                          ? t('panels.eval.runningWithBaseline', {
                              defaultValue: 'evals running · with-skill ▲ vs baseline ▽',
                            })
                          : t('panels.eval.runningWithSkill', {
                              defaultValue: 'evals running · with-skill ▲',
                            })}
                      </>
                    )}
                </div>
              )}
            </div>
          </section>

          {/* Eval queue */}
          <section>
            <div className="mb-2 font-n-mono text-[10px] uppercase tracking-[1.2px] text-n-subtle">
              {t('panels.eval.queue', { defaultValue: 'Eval queue' })}
            </div>
            {groupedByEval.length === 0 ? (
              <span className="font-n-mono text-[11px] text-n-faint">
                {t('panels.eval.empty', { defaultValue: 'No eval run found in this batch.' })}
              </span>
            ) : (
              <ul className="space-y-1">
                {groupedByEval.map(([evalName, list]) => (
                  <EvalQueueRow
                    key={evalName}
                    evalName={evalName}
                    list={list}
                    selectedRunId={selectedRunId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Delta vs baseline */}
          {(delta !== null || passRate !== null) && (
            <section>
              <div className="mb-2 font-n-mono text-[10px] uppercase tracking-[1.2px] text-n-subtle">
                {t('panels.eval.delta', { defaultValue: 'Delta vs baseline' })}
              </div>
              <div className="rounded-n-md border border-n-border-subtle bg-n-canvas p-3.5">
                {delta !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-n-mono text-[28px] font-medium leading-none tabular-nums"
                      style={{
                        color:
                          delta > 0
                            ? 'var(--n-healthy)'
                            : delta < 0
                              ? 'var(--n-critical)'
                              : 'var(--n-fg-muted)',
                      }}
                    >
                      {delta > 0 ? '+' : ''}
                      {Math.round(delta * 100)}%
                    </span>
                    <span className="font-n-mono text-[11px] text-n-faint">
                      {t('panels.eval.uplift', { defaultValue: 'pass rate uplift' })}
                    </span>
                  </div>
                ) : (
                  <div className="font-n-mono text-[11px] text-n-faint">
                    {t('panels.eval.noBaseline', {
                      defaultValue: 'No baseline runs in this batch.',
                    })}
                  </div>
                )}
                {upliftStats.completed > 0 && (
                  <div className="mt-2 text-[12px] leading-relaxed text-n-muted">
                    {t('panels.eval.upliftBody', {
                      defaultValue:
                        'With-skill outperforms baseline on {{wins}}/{{total}} completed evals so far.',
                      wins: upliftStats.wins,
                      total: upliftStats.completed,
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Count, across the batch, how many evals genuinely improved when run
 * with-skill vs baseline. We compare the `completed` flag rather than
 * a real pass/total because the daemon doesn't expose grading
 * summaries through the live `SkillEvalRun` payload — once both sides
 * have completed the run is considered "won" if with-skill landed
 * `completed` while baseline ended `completed` too (or didn't run).
 * The eval matrix view remains the source of truth for proper
 * pass/total deltas.
 */
function computeUplift(grouped: Array<[string, SkillEvalRun[]]>): {
  wins: number;
  completed: number;
} {
  let wins = 0;
  let completed = 0;
  for (const [, list] of grouped) {
    const ws = list.find((r) => r.config === 'with_skill');
    if (!ws) continue;
    if (ws.status !== 'completed' && ws.status !== 'failed' && ws.status !== 'stopped')
      continue;
    completed += 1;
    if (ws.status === 'completed') wins += 1;
  }
  return { wins, completed };
}

function EvalQueueRow({
  evalName,
  list,
  selectedRunId,
  onSelect,
}: {
  evalName: string;
  list: SkillEvalRun[];
  selectedRunId: string | null;
  onSelect(runId: string): void;
}) {
  // Reference run = the with-skill member of the group when present
  // (the row's status / chip mirrors that one). Clicking the row jumps
  // the chat to the with-skill run; the in-chat toggle exposes baseline.
  const reference = list.find((r) => r.config === 'with_skill') ?? list[0]!;
  const tone = evalStatusTone(reference.status);
  const isSelected = list.some((r) => r.runId === selectedRunId);
  const right =
    reference.status === 'completed' ? (
      <PassTotalChip run={reference} />
    ) : (
      <span
        className="font-n-mono text-[10.5px] uppercase tracking-[0.5px]"
        style={{ color: tone.color }}
      >
        {tone.label}
      </span>
    );
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(reference.runId)}
        className={
          'flex w-full items-center gap-2.5 rounded-n-sm border px-2.5 py-1.5 text-left transition-colors ' +
          (isSelected
            ? 'border-n-accent-line bg-n-accent-soft'
            : 'border-n-border-subtle bg-n-canvas hover:border-n-border-default hover:bg-n-sunken')
        }
      >
        <span
          className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + (tone.pulse ? 'n-pulse' : '')}
          style={{ background: tone.color }}
        />
        <span
          className={
            'min-w-0 flex-1 truncate font-n-mono text-[11.5px] ' +
            (isSelected ? 'text-n-accent' : 'text-n-fg')
          }
          title={evalName}
        >
          {evalName}
        </span>
        {right}
      </button>
    </li>
  );
}

function PassTotalChip({ run }: { run: SkillEvalRun }) {
  // Without grading.json on hand we approximate "pass rate" via the
  // run-level status (completed = pass). The eval matrix carries the
  // accurate X/Y. Keep the chip shape consistent with the mockup
  // anyway so the side panel stays readable.
  return (
    <span className="font-n-mono text-[11px] tabular-nums text-n-healthy">
      {run.status === 'completed' ? 'done' : '—'}
    </span>
  );
}

// ── Helpers (eval) ─────────────────────────────────────────────────────────

function useAgentRunFromStore(runId: string): AgentRun | undefined {
  const snapshot = useSyncExternalStore(
    agentRunStore.subscribe,
    agentRunStore.getActiveSnapshot,
    agentRunStore.getActiveSnapshot,
  );
  return snapshot.find((r) => r.id === runId);
}

function aggregateEvalRuns(runs: SkillEvalRun[]): {
  passed: number;
  total: number;
  tokens: number;
} {
  // SkillEvalRun doesn't carry the assertion summary directly — the
  // grading is on disk. While the run is live we don't have the
  // pass/total breakdown reliably; once `status === 'completed'` the
  // matrix view exposes it via the eval matrix request. For PR9b we
  // approximate from `tokensUsed` and treat 'completed' as 1 pass
  // unit, leaving the precise X/Y to the eval matrix view (the
  // RunDock + EvalDiffOverlay are the canonical place for the
  // grading numbers).
  let passed = 0;
  let total = 0;
  let tokens = 0;
  for (const run of runs) {
    tokens += run.tokensUsed;
    if (run.status === 'completed') {
      passed += 1;
      total += 1;
    } else if (run.status === 'failed' || run.status === 'stopped') {
      total += 1;
    }
  }
  return { passed, total, tokens };
}

function evalStatusTone(status: SkillEvalRun['status']): {
  color: string;
  label: string;
  pulse?: boolean;
} {
  switch (status) {
    case 'queued':
      return { color: 'var(--n-fg-muted)', label: 'queued' };
    case 'starting':
      return { color: 'var(--n-info)', label: 'starting', pulse: true };
    case 'running':
      return { color: 'var(--n-accent)', label: 'running', pulse: true };
    case 'waiting_for_input':
      return { color: 'var(--n-watch)', label: 'waiting', pulse: true };
    case 'grading':
      return { color: 'var(--n-info)', label: 'grading', pulse: true };
    case 'completed':
      return { color: 'var(--n-healthy)', label: 'done' };
    case 'failed':
      return { color: 'var(--n-critical)', label: 'failed' };
    case 'stopped':
      return { color: 'var(--n-fg-faint)', label: 'stopped' };
  }
}

// ── Placeholder for kinds not yet ported (eval / analyze-convo) ────────────

function UnsupportedKindPlaceholder({
  kind,
  runId,
  title,
  onClose,
}: {
  kind: AgentRunKind;
  runId: string;
  title?: string;
  onClose(): void;
}) {
  const { t } = useTranslation('runs');
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden font-n-sans">
      <NewRunHeader kind={kind} status="pending" title={title ?? runId} onBack={onClose} />
      <div className="flex flex-1 items-center justify-center bg-n-canvas">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-8 py-7 text-center">
          <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
            {kind}
          </div>
          <div className="mt-2 text-[15px] text-n-fg">
            {t('unsupported.title', { defaultValue: 'Coming soon' })}
          </div>
          <div className="mt-1 text-[12.5px] text-n-muted">
            {t('unsupported.body', {
              defaultValue: 'This run kind is wired up in a follow-up PR.',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Translate the kind-specific runner status (`AuditRunStatus`,
 * `EvalRunStatus`, …) into the unified `AgentRunStatus` enum
 * understood by every new-design surface (header / dock / store).
 */
function mapAuditStatus(status: AuditRun['status']): import('@nakiros/shared').AgentRunStatus {
  switch (status) {
    case 'starting':
      return 'pending';
    case 'running':
      return 'running';
    case 'waiting_for_input':
      return 'awaiting_input';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'cancelled';
  }
}

function composeTitle(kind: AgentRunKind, run: AuditRun, t: ReturnType<typeof useTranslation>['t']): string {
  const labelByKind: Record<string, string> = {
    audit: t('titles.audit', { defaultValue: 'Audit' }),
    fix: t('titles.fix', { defaultValue: 'Fix' }),
    create: t('titles.create', { defaultValue: 'Create skill' }),
  };
  const prefix = labelByKind[kind] ?? kind;
  if ('skillName' in run && typeof run.skillName === 'string') {
    return `${prefix} · ${run.skillName}`;
  }
  return prefix;
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

// ── Recap / diff plumbing helpers ─────────────────────────────────────────

interface RunScreenIdentity {
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
}

function identityFromAgentRun(
  agentRun: AgentRun,
  evalRuns: SkillEvalRun[] | null,
): RunScreenIdentity | null {
  if (agentRun.target?.type !== 'skill') {
    const head = evalRuns?.[0];
    if (!head) return null;
    return {
      scope: head.scope,
      skillName: head.skillName,
      projectId: head.projectId,
      pluginName: head.pluginName,
      marketplaceName: head.marketplaceName,
    };
  }
  const head = evalRuns?.[0];
  return {
    scope: agentRun.target.scope,
    skillName: agentRun.target.skillName,
    projectId: head?.projectId ?? agentRun.target.projectId,
    pluginName: head?.pluginName ?? agentRun.target.pluginName,
    marketplaceName: head?.marketplaceName ?? agentRun.target.marketplaceName,
  };
}

function matrixRequestFromIdentity(identity: RunScreenIdentity): GetEvalMatrixRequest {
  return {
    scope: identity.scope,
    skillName: identity.skillName,
    ...(identity.projectId !== undefined ? { projectId: identity.projectId } : {}),
    ...(identity.pluginName !== undefined ? { pluginName: identity.pluginName } : {}),
    ...(identity.marketplaceName !== undefined
      ? { marketplaceName: identity.marketplaceName }
      : {}),
  };
}

function stubSkillFor(identity: RunScreenIdentity | null): Skill {
  // Minimal Skill shape: empty evals.iterations means no timestamps in the
  // diff overlay (acceptable for the recap entry point — users get full
  // timestamps via the matrix view).
  return {
    name: identity?.skillName ?? '',
    description: '',
    location: '',
    files: [],
    audits: { history: [] },
    evals: { definitions: [], iterations: [] },
  } as unknown as Skill;
}

