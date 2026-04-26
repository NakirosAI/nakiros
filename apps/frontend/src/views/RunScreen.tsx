import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRunKind, AuditRun, AuditRunEvent } from '@nakiros/shared';
import { useRunState } from '../hooks/useRunState';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { agentRunStore } from '../lib/agent-run-store';
import { getRunAPI } from '../lib/run-api';
import {
  HumanInteractionPanel,
  RESUME_PROMPTS,
  RunErrorBanner,
} from '../components/runs';
import NewRunHeader from '../components/runs/NewRunHeader';
import RunStream from '../components/runs/RunStream';
import RunSidePanel from '../components/runs/RunSidePanel';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';

interface RunScreenProps {
  /** Run id from the agent run store. */
  runId: string;
  /** Discriminator — drives which IPC channels we subscribe to. */
  runKind: AgentRunKind;
  /** Closes the tab — typically passed by `NewShell.closeTab`. */
  onClose(): void;
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
export default function RunScreen({ runId, runKind, onClose }: RunScreenProps) {
  const { t } = useTranslation('runs');

  // `getRunAPI` returns a fresh object on every call — without
  // memoisation, every render of this component would invalidate the
  // useEffect deps below (and the `useRunState` subscription) and
  // produce a flicker between the loading state and the chat.
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
    />
  );
}

// ── Body — rendered once the initial run has loaded ────────────────────────

function RunScreenBody({
  runKind,
  bootedRun,
  api,
  onClose,
}: {
  runKind: AgentRunKind;
  bootedRun: AuditRun;
  api: NonNullable<ReturnType<typeof getRunAPI>>;
  onClose(): void;
}) {
  const { t } = useTranslation('runs');
  const [reportContent, setReportContent] = useState<string | null>(null);

  const { run, liveEvents, liveScrollRef, handlerError } = useRunState<AuditRun, AuditRunEvent['event']>(
    bootedRun.runId,
    bootedRun,
    api.state,
    (inner) => {
      // The daemon emits a `done` event with `reportPath` on audit completion.
      // We narrow on the discriminator to keep TS happy without leaking the
      // audit type into the eval/fix branches (they don't ship in PR9a).
      if (api.readReport && (inner as { type: string }).type === 'done') {
        const reportPath = (inner as { reportPath?: string }).reportPath;
        if (reportPath) {
          void api.readReport(reportPath).then((content) => {
            if (content !== null) setReportContent(content);
          });
        }
      }
    },
    // No polling — we trust the live event subscription. The legacy
    // overlay (`AuditView`) keeps polling at 500ms via the default,
    // so behaviour outside the new shell is unchanged.
    0,
  );

  // Backfill the report on tab re-open if the run is already terminal.
  useEffect(() => {
    if (!api.readReport) return;
    if (run.status !== 'completed' || !run.reportPath || reportContent) return;
    void api.readReport(run.reportPath).then((content) => {
      if (content !== null) setReportContent(content);
    });
  }, [api, run.status, run.reportPath, reportContent]);

  const elapsed = useElapsedTimer(run.startedAt);
  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isCompleted = run.status === 'completed';
  const isTerminal = isCompleted || run.status === 'failed' || run.status === 'stopped';

  // Map the daemon's kind-specific status enum onto AgentRunStatus
  // (`pending` / `running` / `awaiting_input` / `done` / `failed` /
  // `cancelled`) so `NewRunHeader` always speaks the unified language.
  const status = mapAuditStatus(run.status);

  async function handleStop() {
    await api.actions.stop(run.runId);
  }

  async function handleSend(message: string) {
    await api.actions.sendUserMessage(run.runId, message);
  }

  async function handleResume() {
    const prompt = RESUME_PROMPTS[runKind === 'fix' ? 'fix' : runKind === 'create' ? 'create' : 'audit'];
    await api.actions.sendUserMessage(run.runId, prompt);
  }

  async function handleFinish() {
    await api.actions.finish(run.runId);
    agentRunStore.dismiss(run.runId);
    onClose();
  }

  // Header stats — kept lightweight for PR9a; eval / fix sub-PRs will
  // surface kind-specific KPIs through their own side panels.
  const stats: Array<{ label: string; value: string }> = [];
  if (run.tokensUsed != null) {
    stats.push({ label: 'Tokens', value: formatTokens(run.tokensUsed) });
  }
  stats.push({
    label: 'Elapsed',
    value: formatDuration(isTerminal ? run.durationMs ?? 0 : elapsed),
  });

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
        onResume={isWaiting ? handleResume : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas">
          {isCompleted && reportContent ? (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-[920px] rounded-n-lg border border-n-border-subtle bg-n-surface px-6 py-5">
                <AuditMarkdownViewer content={reportContent} />
              </div>
            </div>
          ) : (
            <RunStream turns={run.turns} liveEvents={liveEvents} isStreaming={isRunning} />
          )}

          <RunErrorBanner message={run.error ?? handlerError} />
          {isWaiting && <HumanInteractionPanel isWaiting onSend={handleSend} />}
        </div>

        <RunSidePanel kind={runKind} run={run} reportContent={reportContent} />
      </div>
    </div>
  );
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
