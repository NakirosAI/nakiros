import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Trash2,
  UploadCloud,
  Wrench,
} from 'lucide-react';
import type { AuditRun, AuditRunEvent, SkillScope } from '@nakiros/shared';
import { TabButton } from '../components/ui';
import {
  AgentActivityFeed,
  HumanInteractionPanel,
  RunControlHeader,
  RunErrorBanner,
} from '../components/runs';
import { agentRunStore } from '../lib/agent-run-store';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { useRunState } from '../hooks/useRunState';
import EvalRunsView from './EvalRunsView';
import FixReviewPanel from '../components/fix/FixReviewPanel';
import { EvalMatrix } from '../components/eval-matrix';

interface Props {
  /** Skill scope (project / claude-global / nakiros-bundled / plugin). */
  scope: SkillScope;
  /** Project id when `scope === 'project'`. */
  projectId?: string;
  /** Plugin name when `scope === 'plugin'`. */
  pluginName?: string;
  /** Marketplace name when `scope === 'plugin'`. */
  marketplaceName?: string;
  /** Skill folder name being fixed/created. */
  skillName: string;
  /** Run snapshot returned by `startFix` / `startCreate`. */
  initialRun: AuditRun;
  /**
   * 'fix' (default): skill exists, temp copy, sync back to existing location.
   * 'create': skill does not exist yet, temp is empty, sync back creates the skill.
   * Only copy and confirm-button labels change — the runtime is identical.
   */
  mode?: 'fix' | 'create';
  /** Closes the overlay; the parent typically refreshes the skills list. */
  onClose(): void;
}

/**
 * Full-screen overlay driving the fix-skill or create-skill agent. Both modes
 * operate on an isolated temp workdir (the tmp_skill pattern) — the user
 * iterates with the agent, optionally runs evals against the temp copy, then
 * either syncs the result back to the real skill location or discards it.
 *
 * Resolves the matching IPC surface based on `mode` and wires it into
 * `useRunState`. Embeds `EvalMatrix` to track in-temp eval iterations,
 * `FixReviewPanel` to review the staged file changes, and launches
 * `EvalRunsView` as a higher-z-index overlay for in-temp eval batches via
 * `runFixEvalsInTemp`. Composes the shared run library (header, activity feed,
 * input panel, error banner) for everything that isn't fix-specific.
 */
export default function FixView({
  scope,
  projectId,
  pluginName,
  marketplaceName,
  skillName,
  initialRun,
  mode = 'fix',
  onClose,
}: Props) {
  const { t } = useTranslation('fix');
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
  const { run, liveEvents, liveScrollRef } = useRunState<AuditRun, AuditRunEvent['event']>(
    initialRun.runId,
    initialRun,
    api,
  );
  const elapsed = useElapsedTimer(initialRun.startedAt);
  const [sending, setSending] = useState(false);
  // Bumped whenever evals finish running so the matrix re-fetches its data.
  const [matrixRefreshKey, setMatrixRefreshKey] = useState(0);
  const [evalsLoading, setEvalsLoading] = useState(false);
  const [evalsRunning, setEvalsRunning] = useState(false);
  /**
   * Once a fix-triggered eval batch is started we remember its run IDs so the
   * user can open the EvalRunsView overlay (and re-open it after closing it).
   * Null = no eval batch has been launched from this fix session yet.
   */
  const [evalSession, setEvalSession] = useState<{ runIds: string[]; iteration: number } | null>(null);
  const [evalsOpen, setEvalsOpen] = useState(false);
  const [viewTab, setViewTab] = useState<'conversation' | 'review'>('conversation');

  // Subscribe to eval events to refresh the matrix when an in-temp run finishes.
  useEffect(() => {
    if (isCreate) return;
    return window.nakiros.onEvalEvent((event) => {
      if (event.event.type === 'done' || (event.event.type === 'status' && event.event.status === 'completed')) {
        setEvalsRunning(false);
        // Bump the key so <EvalMatrix /> re-fetches and reflects the new iteration.
        setMatrixRefreshKey((k) => k + 1);
      }
    });
  }, [isCreate]);

  const isRunning = run.status === 'running' || run.status === 'starting';
  const isWaiting = run.status === 'waiting_for_input';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'stopped';

  async function handleSend(message: string) {
    await api.sendUserMessage(initialRun.runId, message);
  }

  async function handleSync() {
    if (sending) return;
    const prompt = isCreate
      ? t('prompts.syncCreate', { name: skillName })
      : t('prompts.syncFix', { name: skillName });
    if (!confirm(prompt)) return;
    setSending(true);
    try {
      await api.finish(initialRun.runId);
      agentRunStore.dismiss(initialRun.runId);
    } catch (err) {
      alert(t('errors.syncFailed', { message: (err as Error).message }));
    } finally {
      setSending(false);
    }
  }

  async function handleDiscard() {
    if (!confirm(isCreate ? t('prompts.discardCreate') : t('prompts.discardFix'))) return;
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
      alert(t('errors.evalsStartFailed', { message: (err as Error).message }));
    } finally {
      setEvalsLoading(false);
    }
  }

  const headerActions = (
    <>
      {isWaiting && !isCreate && (
        <button
          onClick={handleRunEvalsInTemp}
          disabled={evalsLoading || evalsRunning}
          className="ml-2 flex items-center gap-1 rounded bg-[var(--primary-soft)] px-2 py-1 text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]/80 disabled:opacity-50"
          title={t('header.runEvalsTooltip')}
        >
          {evalsRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {evalsRunning ? t('header.evaluating') : t('header.runEvals')}
        </button>
      )}
      {evalSession && !evalsOpen && (
        <button
          onClick={() => setEvalsOpen(true)}
          className="flex items-center gap-1 rounded bg-[var(--bg-card)] border border-[var(--line)] px-2 py-1 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-muted)]"
          title={t('header.openEvalsTooltip')}
        >
          <Play size={12} />
          {t('header.openEvals', { count: evalSession.runIds.length })}
        </button>
      )}
      {(isWaiting || isRunning) && (
        <button
          onClick={handleDiscard}
          className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/30"
          title={t('header.discardTooltip')}
        >
          <Trash2 size={12} />
          {t('header.discard')}
        </button>
      )}
      {(isWaiting || isRunning) && (
        <button
          onClick={handleSync}
          disabled={sending}
          className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
          title={isCreate ? t('header.syncTooltip.create') : t('header.syncTooltip.fix')}
        >
          <UploadCloud size={12} />
          {isCreate ? t('header.syncLabel.create') : t('header.syncLabel.fix')}
        </button>
      )}
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--bg)]">
        <RunControlHeader
          status={run.status}
          title={`${isCreate ? t('title.create') : t('title.fix')} — ${skillName}`}
          icon={
            isCreate
              ? <Plus size={14} className="text-emerald-400" />
              : <Wrench size={14} className="text-amber-400" />
          }
          tokensUsed={run.tokensUsed}
          durationMs={isTerminal ? run.durationMs : elapsed}
          onBack={onClose}
          actions={headerActions}
        />

        {/* Evolution matrix — shows the live eval history against the in-progress
            fix copy. Collapsed by default so the conversation stays visible;
            click the chevron to expand. */}
        {!isCreate && (
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
            <EvalMatrix
              request={{
                scope,
                projectId,
                pluginName,
                marketplaceName,
                skillName,
                skillDirOverride: run.workdir,
              }}
              refreshKey={matrixRefreshKey}
              collapsible
              defaultCollapsed
            />
          </div>
        )}

        {/* Tab switcher — conversation vs review */}
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-1.5">
          <TabButton active={viewTab === 'conversation'} onClick={() => setViewTab('conversation')}>
            <MessageSquare size={12} />
            {t('tabs.conversation', 'Conversation')}
          </TabButton>
          <TabButton active={viewTab === 'review'} onClick={() => setViewTab('review')}>
            <FileText size={12} />
            {t('tabs.review', 'Review changes')}
          </TabButton>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {viewTab === 'conversation' ? (
            <AgentActivityFeed
              turns={run.turns}
              liveEvents={liveEvents}
              liveScrollRef={liveScrollRef}
              isStreaming={isRunning}
              thinkingVerbs={t('thinking.verbs', { returnObjects: true }) as string[]}
            />
          ) : (
            <FixReviewPanel
              runId={initialRun.runId}
              mode={mode}
              // Force re-fetch whenever the status changes (run might have finished, new files staged, etc.)
              refreshKey={`${run.status}:${run.durationMs}`}
            />
          )}

          <RunErrorBanner message={run.error} title={t('errors.heading')} />
        </div>

        {(isWaiting || isRunning) && (
          <HumanInteractionPanel
            isWaiting={isWaiting}
            isRunning={isRunning}
            onSend={handleSend}
            waitingBanner={isCreate ? t('input.waitingCreate') : t('input.waitingFix')}
            placeholderRunning={t('input.placeholderRunning')}
            placeholderIdle={t('input.placeholderIdle')}
          />
        )}
      </div>

      {/* Evals overlay — sits above FixView (z-[400] > FixView's z-[300]).
          Closing it does NOT stop the runs; they keep streaming and we can reopen. */}
      {evalsOpen && evalSession && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-[var(--bg)]">
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
