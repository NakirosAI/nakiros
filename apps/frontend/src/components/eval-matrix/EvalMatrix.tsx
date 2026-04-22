import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { EvalMatrix as Matrix, GetEvalMatrixRequest, LoadIterationRunRequest } from '@nakiros/shared';
import { CLAUDE_MODEL_LABELS, isClaudeModelId } from '@nakiros/shared';
import { EvalMatrixHeader } from './EvalMatrixHeader';
import { EvalMatrixCellView } from './EvalMatrixCell';
import { EvalMatrixTagBadge } from './EvalMatrixTag';
import { EvalMatrixDrawer } from './EvalMatrixDrawer';

/**
 * The Evolution view: top-level container that fetches the skill's eval matrix
 * and renders the grid + header + drawer. Replaces the old iteration-list
 * panel inside SkillsView. Refreshes on `refreshKey` bump (after a new run).
 */
export function EvalMatrix({
  request,
  refreshKey,
  collapsible = false,
  defaultCollapsed = false,
}: {
  request: GetEvalMatrixRequest;
  /**
   * Bump this number after triggering a new eval run to force a refetch.
   * Not required — the panel also refreshes on mount.
   */
  refreshKey?: number;
  /**
   * When true, show a collapse/expand toggle in the header so the matrix can
   * be folded down to just its summary row. Handy when the matrix shares
   * vertical space with a chat (e.g. FixView).
   */
  collapsible?: boolean;
  /** When `collapsible`, start in the collapsed state. */
  defaultCollapsed?: boolean;
}) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerRequest, setDrawerRequest] = useState<LoadIterationRunRequest | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    window.nakiros
      .getEvalMatrix(request)
      .then((data) => {
        if (mounted) setMatrix(data);
      })
      .catch((err: unknown) => {
        if (mounted) setError((err as Error).message ?? String(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [request.scope, request.projectId, request.skillName, refreshKey]);

  if (loading && !matrix) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <RefreshCw size={12} className="animate-spin" />
        Loading evolution…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        Failed to load matrix: {error}
      </div>
    );
  }

  if (!matrix || matrix.iterations.length === 0) {
    return (
      <div className="rounded border border-[var(--line)] bg-[var(--bg-card)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
        No eval iterations yet. Run evals at least once to see the evolution matrix.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {collapsible && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="mt-3 shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
            title={collapsed ? 'Expand matrix' : 'Collapse matrix'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        <div className="flex-1">
          <EvalMatrixHeader metrics={matrix.metrics} />
        </div>
      </div>

      {!collapsed && (
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
        <table className="min-w-full border-separate border-spacing-y-1 p-3">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 text-left text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                Eval
              </th>
              {matrix.iterations.map((iter, i) => {
                const rawModel = matrix.models[i];
                const modelLabel = isClaudeModelId(rawModel)
                  ? CLAUDE_MODEL_LABELS[rawModel]
                  : rawModel;
                return (
                  <th
                    key={iter}
                    className="px-1 pb-1 text-center text-[10px] font-semibold text-[var(--text-muted)]"
                  >
                    <div>iter {iter}</div>
                    {modelLabel ? (
                      <div
                        className="mt-0.5 text-[9px] font-normal uppercase tracking-wide text-[var(--text-muted)] opacity-70"
                        title={rawModel ?? undefined}
                      >
                        {modelLabel}
                      </div>
                    ) : null}
                  </th>
                );
              })}
              <th className="px-2 pb-1 text-left text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.evalName}>
                <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap">
                  {row.evalName}
                </td>
                {row.withSkill.map((withCell, i) => {
                  const withoutCell = row.withoutSkill[i];
                  const selectedCellMatches =
                    drawerRequest?.evalName === row.evalName &&
                    drawerRequest?.iteration === matrix.iterations[i];
                  return (
                    <td key={i} className="px-1 py-1">
                      <EvalMatrixCellView
                        withCell={withCell}
                        withoutCell={withoutCell}
                        selected={selectedCellMatches}
                        selectedConfig={selectedCellMatches ? (drawerRequest?.config ?? null) : null}
                        onClickWith={
                          withCell
                            ? () =>
                                setDrawerRequest({
                                  scope: request.scope,
                                  projectId: request.projectId,
                                  skillName: request.skillName,
                                  skillDirOverride: request.skillDirOverride,
                                  iteration: matrix.iterations[i],
                                  evalName: row.evalName,
                                  config: 'with_skill',
                                })
                            : undefined
                        }
                        onClickWithout={
                          withoutCell
                            ? () =>
                                setDrawerRequest({
                                  scope: request.scope,
                                  projectId: request.projectId,
                                  skillName: request.skillName,
                                  skillDirOverride: request.skillDirOverride,
                                  iteration: matrix.iterations[i],
                                  evalName: row.evalName,
                                  config: 'without_skill',
                                })
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1">
                  <EvalMatrixTagBadge tag={row.tag} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 pt-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                pass rate
              </td>
              {matrix.metrics.passRateByIteration.map((pr, i) => (
                <td key={i} className="px-1 pt-2 text-center text-[11px] text-[var(--text-primary)]">
                  {(pr * 100).toFixed(0)}%
                </td>
              ))}
              <td />
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                tokens
              </td>
              {matrix.metrics.tokensByIteration.map((t, i) => (
                <td key={i} className="px-1 text-center text-[11px] text-[var(--text-muted)]">
                  {formatTokens(t.withSkill)}
                </td>
              ))}
              <td />
            </tr>
            {matrix.metrics.tokensByIteration.some((t) => t.delta !== null) && (
              <tr>
                <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  Δ vs baseline
                </td>
                {matrix.metrics.tokensByIteration.map((t, i) => (
                  <td
                    key={i}
                    className={`px-1 text-center text-[11px] ${
                      t.delta === null
                        ? 'text-[var(--text-muted)]'
                        : t.delta > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {t.delta === null ? '—' : formatTokensSigned(t.delta)}
                  </td>
                ))}
                <td />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      )}

      <EvalMatrixDrawer request={drawerRequest} onClose={() => setDrawerRequest(null)} />
    </div>
  );
}

function formatTokens(n: number): string {
  if (Math.abs(n) < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}
function formatTokensSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${formatTokens(n)}`;
}
