import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ComparisonFingerprintStatus,
  ComparisonMatrix,
  ComparisonSummary,
  EvalRunEvent,
  ListComparisonsRequest,
  RunComparisonRequest,
  SkillEvalRun,
} from '@nakiros/shared';
import { CLAUDE_MODEL_IDS, CLAUDE_MODEL_LABELS, type ClaudeModelId } from '@nakiros/shared';

import { PassRateBadge } from '../../views/skills/components';

// ---------------------------------------------------------------------------
// ModelComparison view — the "Models" tab that complements Evolution.
//
// UX:
//  1. Empty state: show the launch panel (pick models, read fingerprint hint,
//     hit Run).
//  2. Running: live counter of pending runs sourced from eval:event.
//  3. Viewing: selector for past comparisons + the results matrix (compact by
//     default, expand via "Show baseline").
// ---------------------------------------------------------------------------

interface Props {
  request: ListComparisonsRequest;
  /** Bump to force a refetch of the comparisons list + fingerprint status. */
  refreshKey?: number;
  /**
   * Called with the fresh runIds the moment a comparison is launched. Wired at
   * the skill-view level so the shell can swap in `EvalRunsView` — that view
   * already handles interactive evals (chat, send, finish) which the local
   * run grid here does not. Not called when every selected model was reused
   * (runIds: []), in which case there is nothing interactive to handle.
   */
  onRunsLaunched?(runIds: string[]): void;
}

type Mode = 'idle' | 'running' | 'viewing';

/**
 * The Models tab — A/B/C comparison of the same eval suite across multiple
 * Claude model ids on a frozen skill iteration. Three modes:
 *  - idle: launch panel only (pick models + Run)
 *  - running: live grid of in-flight runs (subscribed to `eval:event`)
 *  - viewing: history selector + comparison matrix (with optional baseline)
 *
 * Reuses prior runs that share a skill fingerprint to save tokens — the
 * `Reuse` badge on a model checkbox tells the user it's free.
 */
export function ModelComparison({ request, refreshKey, onRunsLaunched }: Props) {
  const { t } = useTranslation('comparison');

  // ── Data loaded from the daemon ─────────────────────────────────────────
  const [summaries, setSummaries] = useState<ComparisonSummary[]>([]);
  const [fingerprintStatus, setFingerprintStatus] = useState<ComparisonFingerprintStatus | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  // ── Selected comparison + its matrix ────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<ComparisonMatrix | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  // ── Launch panel state ──────────────────────────────────────────────────
  const [selectedModels, setSelectedModels] = useState<Set<ClaudeModelId>>(
    () => new Set(CLAUDE_MODEL_IDS),
  );
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // ── Running state (driven by eval:event) ────────────────────────────────
  // `trackedRunIds` never shrinks during a batch — it's the full set we
  // want to render in the live grid, even once individual runs finish.
  // `pendingRunIds` is the shrinking subset still unfinished, used only to
  // flip mode and drive the counter.
  const [trackedRunIds, setTrackedRunIds] = useState<Set<string>>(new Set());
  const [pendingRunIds, setPendingRunIds] = useState<Set<string>>(new Set());
  const [trackedRuns, setTrackedRuns] = useState<SkillEvalRun[]>([]);
  const [totalRunIds, setTotalRunIds] = useState<number>(0);
  const mode: Mode = launching || pendingRunIds.size > 0 ? 'running' : selectedId ? 'viewing' : 'idle';

  const [showBaseline, setShowBaseline] = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [list, fp] = await Promise.all([
        window.nakiros.listModelComparisons(request),
        window.nakiros.getComparisonFingerprintStatus(request),
      ]);
      setSummaries(list);
      setFingerprintStatus(fp);
      setSelectedId((prev) => prev ?? list[0]?.comparisonId ?? null);
    } finally {
      setLoadingList(false);
    }
  }, [request]);

  useEffect(() => {
    void fetchList();
  }, [fetchList, refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setMatrix(null);
      return;
    }
    setLoadingMatrix(true);
    window.nakiros
      .getModelComparison({ ...request, comparisonId: selectedId })
      .then((m) => setMatrix(m))
      .finally(() => setLoadingMatrix(false));
  }, [selectedId, request]);

  // Subscribe to eval:event to drive the "running" state.
  useEffect(() => {
    const off = window.nakiros.onEvalEvent((raw) => {
      const e = raw as EvalRunEvent;
      if (e.event.type === 'done') {
        setPendingRunIds((prev) => {
          if (!prev.has(e.runId)) return prev;
          const next = new Set(prev);
          next.delete(e.runId);
          if (next.size === 0) {
            // All runs done → refresh the list + the active matrix.
            void fetchList();
            if (selectedId) {
              void window.nakiros
                .getModelComparison({ ...request, comparisonId: selectedId })
                .then(setMatrix);
            }
          }
          return next;
        });
      }
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [fetchList, request, selectedId]);

  // ── Actions ─────────────────────────────────────────────────────────────
  function toggleModel(id: ClaudeModelId): void {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLaunch(): Promise<void> {
    if (selectedModels.size === 0) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const body: RunComparisonRequest = {
        ...request,
        models: Array.from(selectedModels),
      };
      const response = await window.nakiros.runModelComparison(body);
      setSelectedId(response.comparisonId);
      setTrackedRunIds(new Set(response.runIds));
      setPendingRunIds(new Set(response.runIds));
      setTrackedRuns([]);
      setTotalRunIds(response.runIds.length);
      // An all-reused comparison returns no runIds — reload immediately.
      if (response.runIds.length === 0) {
        await fetchList();
      } else if (onRunsLaunched) {
        // Hand the fresh runIds to the skill-view shell so the user can
        // follow each run + answer interactive prompts via EvalRunsView.
        onRunsLaunched(response.runIds);
      }
    } catch (err) {
      setLaunchError((err as Error).message ?? String(err));
    } finally {
      setLaunching(false);
    }
  }

  // ── Poll run states while anything is pending (drives the run grid) ──────
  useEffect(() => {
    if (trackedRunIds.size === 0) {
      setTrackedRuns([]);
      return;
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const all = (await window.nakiros.listEvalRuns()) as SkillEvalRun[];
        if (cancelled) return;
        setTrackedRuns(all.filter((r) => trackedRunIds.has(r.runId)));
      } catch {
        // ignore — next tick will retry
      }
    };
    void tick();
    // Stop polling once the whole batch is done, but keep the final snapshot
    // visible for a moment so the user sees the last statuses before the grid
    // gets replaced by the matrix view.
    if (pendingRunIds.size === 0) {
      const clearTimer = setTimeout(() => setTrackedRunIds(new Set()), 2000);
      return () => {
        cancelled = true;
        clearTimeout(clearTimer);
      };
    }
    const interval = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [trackedRunIds, pendingRunIds]);

  // ── Render branches ─────────────────────────────────────────────────────
  if (loadingList && !fingerprintStatus) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <RefreshCw size={12} className="animate-spin" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <LaunchPanel
        selectedModels={selectedModels}
        onToggleModel={toggleModel}
        fingerprintStatus={fingerprintStatus}
        onLaunch={handleLaunch}
        disabled={mode === 'running'}
        error={launchError}
      />

      {mode === 'running' && (
        <RunningBanner
          pending={pendingRunIds.size}
          total={totalRunIds}
        />
      )}

      {trackedRuns.length > 0 && <ComparisonRunsGrid runs={trackedRuns} />}

      {summaries.length > 0 && (
        <ComparisonSelector
          summaries={summaries}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {selectedId && matrix && !loadingMatrix && (
        <ComparisonTable
          matrix={matrix}
          showBaseline={showBaseline}
          onToggleBaseline={() => setShowBaseline((v) => !v)}
        />
      )}

      {selectedId && loadingMatrix && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <RefreshCw size={12} className="animate-spin" />
          {t('loadingMatrix')}
        </div>
      )}

      {mode === 'idle' && summaries.length === 0 && (
        <div className="rounded border border-[var(--line)] bg-[var(--bg-card)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
          {t('emptyHint')}
        </div>
      )}
    </div>
  );
}

// ─── LaunchPanel ────────────────────────────────────────────────────────────

function LaunchPanel({
  selectedModels,
  onToggleModel,
  fingerprintStatus,
  onLaunch,
  disabled,
  error,
}: {
  selectedModels: Set<ClaudeModelId>;
  onToggleModel(id: ClaudeModelId): void;
  fingerprintStatus: ComparisonFingerprintStatus | null;
  onLaunch(): void;
  disabled: boolean;
  error: string | null;
}) {
  const { t } = useTranslation('comparison');
  const hasIteration = !!fingerprintStatus?.lastIteration;
  const canReuse = !!fingerprintStatus?.canReuseLastIteration;
  const reusedModel = fingerprintStatus?.lastIteration?.model ?? null;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {CLAUDE_MODEL_IDS.map((id) => {
            const isReused = canReuse && reusedModel === id && selectedModels.has(id);
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                  selectedModels.has(id)
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedModels.has(id)}
                  onChange={() => onToggleModel(id)}
                  disabled={disabled}
                  className="accent-[var(--primary)]"
                />
                {CLAUDE_MODEL_LABELS[id]}
                {isReused && (
                  <span
                    className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1 text-[9px] uppercase text-emerald-400"
                    title={t('reuseHint')}
                  >
                    <Zap size={9} />
                    {t('reuseBadge')}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <button
          onClick={onLaunch}
          disabled={disabled || selectedModels.size === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
        >
          <Play size={12} />
          {disabled ? t('running') : t('runComparison')}
        </button>
      </div>

      {hasIteration && (
        <FingerprintHint status={fingerprintStatus!} />
      )}

      {error && (
        <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

function FingerprintHint({ status }: { status: ComparisonFingerprintStatus }) {
  const { t } = useTranslation('comparison');
  const last = status.lastIteration;
  if (!last) return null;

  if (status.canReuseLastIteration && last.model) {
    return (
      <div className="mt-2 flex items-start gap-2 text-[11px] text-emerald-400">
        <Zap size={11} className="mt-0.5 shrink-0" />
        <span>
          {t('reuseAvailable', {
            iteration: last.iteration,
            model: last.model,
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-400">
      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
      <span>
        {last.model
          ? t('fingerprintChangedWithModel', { iteration: last.iteration, model: last.model })
          : t('fingerprintChanged', { iteration: last.iteration })}
      </span>
    </div>
  );
}

// ─── RunningBanner ──────────────────────────────────────────────────────────

function RunningBanner({ pending, total }: { pending: number; total: number }) {
  const { t } = useTranslation('comparison');
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-3 py-2 text-xs text-[var(--primary)]">
      <Loader2 size={12} className="animate-spin" />
      <span>{t('runningStatus', { pending: total - pending, total })}</span>
    </div>
  );
}

// ─── ComparisonSelector ─────────────────────────────────────────────────────

function ComparisonSelector({
  summaries,
  selectedId,
  onSelect,
}: {
  summaries: ComparisonSummary[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const { t } = useTranslation('comparison');
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span className="uppercase">{t('history')}</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1 text-xs text-[var(--text-primary)]"
      >
        {summaries.map((s) => (
          <option key={s.comparisonId} value={s.comparisonId}>
            {formatTimestamp(s.timestamp)} — {s.models.join(' / ')}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ─── ComparisonTable ────────────────────────────────────────────────────────

function ComparisonTable({
  matrix,
  showBaseline,
  onToggleBaseline,
}: {
  matrix: ComparisonMatrix;
  showBaseline: boolean;
  onToggleBaseline(): void;
}) {
  const { t } = useTranslation('comparison');
  const models = useMemo(() => matrix.models, [matrix]);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div className="text-xs text-[var(--text-muted)]">
          {t('timestamp', { value: formatTimestamp(matrix.timestamp) })}
        </div>
        <button
          onClick={onToggleBaseline}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {showBaseline ? <EyeOff size={12} /> : <Eye size={12} />}
          {showBaseline ? t('hideBaseline') : t('showBaseline')}
        </button>
      </div>

      <div className="overflow-x-auto p-3">
        <table className="min-w-full border-separate border-spacing-y-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 text-left text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                {t('evalColumn')}
              </th>
              {models.map((model, i) => {
                const reused = matrix.perModel[i]?.reused;
                return (
                  <th
                    key={model}
                    className="px-2 pb-1 text-center text-[10px] font-semibold uppercase text-[var(--text-muted)]"
                  >
                    {readableModel(model)}
                    {reused && (
                      <span
                        className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-400"
                        title={t('reuseHint')}
                      >
                        <Zap size={9} />
                        {t('reuseBadge')}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.evalName}>
                <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap">
                  {row.evalName}
                </td>
                {row.withSkill.map((cell, i) => {
                  const baseline = row.withoutSkill[i];
                  return (
                    <td key={i} className="px-1 py-1 text-center">
                      <CompactCell cell={cell} baseline={baseline} />
                      {showBaseline && baseline && (
                        <div className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                          {t('baselineLabel')}: {Math.round(baseline.passRate * 100)}%
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 pt-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                {t('passRate')}
              </td>
              {matrix.perModel.map((m, i) => (
                <td key={i} className="px-1 pt-2 text-center text-[11px] text-[var(--text-primary)]">
                  {Math.round(m.passRate * 100)}%
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                {t('tokens')}
              </td>
              {matrix.perModel.map((m, i) => (
                <td key={i} className="px-1 text-center text-[11px] text-[var(--text-muted)]">
                  {formatTokens(m.tokens)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CompactCell({
  cell,
  baseline,
}: {
  cell: ComparisonMatrix['rows'][number]['withSkill'][number];
  baseline: ComparisonMatrix['rows'][number]['withoutSkill'][number];
}) {
  if (!cell) return <span className="text-[var(--text-muted)]">—</span>;
  const pct = Math.round(cell.passRate * 100);
  const deltaPct = baseline ? pct - Math.round(baseline.passRate * 100) : null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <PassRateBadge rate={cell.passRate} size="sm" />
      {deltaPct !== null && (
        <span
          className={`text-[9px] ${
            deltaPct > 0 ? 'text-emerald-400' : deltaPct < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
          }`}
        >
          {deltaPct > 0 ? '+' : ''}
          {deltaPct}%
        </span>
      )}
      <span className="text-[9px] text-[var(--text-muted)]">{formatTokens(cell.tokens)}</span>
    </div>
  );
}

function readableModel(id: string): string {
  const label = (CLAUDE_MODEL_LABELS as Record<string, string>)[id];
  return label ?? id;
}

function formatTokens(n: number): string {
  if (Math.abs(n) < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

// ─── ComparisonRunsGrid ─────────────────────────────────────────────────────
// Live view of every run in the current comparison batch, grouped by model so
// the user can see exactly where each cell stands. Bug fix for the previous
// version that only exposed the aggregate pending/total counter.

function ComparisonRunsGrid({ runs }: { runs: SkillEvalRun[] }) {
  const { t } = useTranslation('comparison');
  const byModel = useMemo(() => {
    const map = new Map<string, SkillEvalRun[]>();
    for (const r of runs) {
      const key = r.model ?? '(default)';
      const bucket = map.get(key) ?? [];
      bucket.push(r);
      map.set(key, bucket);
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => {
        const byName = a.evalName.localeCompare(b.evalName);
        return byName !== 0 ? byName : a.config.localeCompare(b.config);
      });
    }
    return map;
  }, [runs]);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {t('liveRunsHeading', { count: runs.length })}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from(byModel.entries()).map(([model, bucket]) => (
          <div key={model} className="rounded border border-[var(--line)] bg-[var(--bg-soft)] p-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--text-primary)]">
              <span>{readableModel(model)}</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {t('runsCount', { count: bucket.length })}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {bucket.map((run) => (
                <li
                  key={run.runId}
                  className="flex items-center gap-1.5 rounded bg-[var(--bg-card)] px-1.5 py-1 text-[10px]"
                >
                  <RunStatusIcon status={run.status} />
                  <span className="flex-1 truncate text-[var(--text-primary)]" title={run.evalName}>
                    {run.evalName}
                  </span>
                  <span
                    className={`rounded px-1 text-[9px] ${
                      run.config === 'with_skill'
                        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'bg-[var(--bg-muted)] text-[var(--text-muted)]'
                    }`}
                  >
                    {run.config === 'with_skill' ? 'with' : 'base'}
                  </span>
                  <span className="shrink-0 text-[9px] text-[var(--text-muted)]">
                    {formatTokens(run.tokensUsed)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunStatusIcon({ status }: { status: SkillEvalRun['status'] }) {
  if (status === 'completed') return <CheckCircle2 size={11} className="text-emerald-400" />;
  if (status === 'failed' || status === 'stopped')
    return <XCircle size={11} className="text-red-400" />;
  return <Loader2 size={11} className="animate-spin text-[var(--primary)]" />;
}
