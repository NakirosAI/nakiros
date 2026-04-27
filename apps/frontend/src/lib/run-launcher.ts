import type { SkillTabIdentity } from '../hooks/useTabs';

/**
 * Centralised "start a run + open its tab" helpers used by every
 * call-to-action button across the new shell (audit / fix / eval /
 * create). The flow is the same in every case:
 *
 *   1. Build the request payload from a {@link SkillTabIdentity}.
 *   2. Call the kind-specific `start*` IPC.
 *   3. Hand the runId off to the caller via `openRunTab` so the
 *      shell pushes a new `kind: 'run'` tab in front of the user.
 *
 * Eval is the only kind whose response isn't a single `AuditRun`; it
 * returns `{ iteration, runIds[] }` and the unified AgentRun id is
 * derived from `(scope, identity, iteration)` — same convention as
 * `useAgentRunsSync.batchKey`.
 */

/** Callback fired with the resolved run identity once the start succeeds. */
export type OpenRunTabCallback = (params: {
  runId: string;
  runKind: 'audit' | 'fix' | 'create' | 'eval';
  label: string;
}) => void;

/** Eval-specific options exposed to the toolbar. */
export interface LaunchEvalOptions {
  evalNames?: string[];
  /**
   * @deprecated since the per-model baseline cache landed (PR2 of the
   * baseline-per-model refactor). The daemon ignores this flag — baselines
   * are now always available (cache hit or fresh compute on miss). Use
   * {@link refreshBaseline} to force a recompute. Field kept for one PR's
   * worth of compat with legacy callers.
   */
  includeBaseline?: boolean;
  /**
   * Force a fresh baseline compute even when one is already cached for
   * `(skill, eval, modelFullId, evalFingerprint)`. Used by the matrix
   * toolbar's "Recalculer la baseline" action.
   */
  refreshBaseline?: boolean;
  /**
   * Run ONLY the without_skill config (no with_skill). Pairs with
   * `refreshBaseline` for the kebab "Recalculer la baseline" action: this
   * way the user pays only for the baseline run, not a full iteration.
   * Baseline-only runs don't appear in the matrix (no iteration bump,
   * no benchmark.json) — they just refresh the per-model cache.
   */
  baselineOnly?: boolean;
  maxConcurrent?: number;
  model?: string;
  skillDirOverride?: string;
}

export async function launchAudit(
  identity: SkillTabIdentity,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const run = await window.nakiros.startAudit(identityToRequest(identity));
  openRunTab({
    runId: run.runId,
    runKind: 'audit',
    label: `Audit · ${identity.skillName}`,
  });
}

export async function launchFix(
  identity: SkillTabIdentity,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const run = await window.nakiros.startFix(identityToRequest(identity));
  openRunTab({
    runId: run.runId,
    runKind: 'fix',
    label: `Fix · ${identity.skillName}`,
  });
}

export async function launchCreate(
  identity: SkillTabIdentity,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const run = await window.nakiros.startCreate(identityToRequest(identity));
  openRunTab({
    runId: run.runId,
    runKind: 'create',
    label: `Create · ${identity.skillName}`,
  });
}

export async function launchEvalBatch(
  identity: SkillTabIdentity,
  options: LaunchEvalOptions,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const response = await window.nakiros.startEvalRuns({
    ...identityToRequest(identity),
    ...options,
  });

  // Baseline-only runs don't bump the iteration counter and don't
  // appear in the matrix. We still open a tab so the user can watch
  // progress, but with a distinct label + a unique runId derived from
  // the actual claude run (no batchKey, no iteration).
  if (options.baselineOnly) {
    const runId = response.runIds[0];
    if (!runId) return;
    openRunTab({
      runId: `eval:${runId}`,
      runKind: 'eval',
      label: `Baseline · ${identity.skillName}`,
    });
    return;
  }

  // Mirror `useAgentRunsSync.batchKey` so the unified store and the
  // tab agree on the same id.
  const projectId = identity.scope === 'project' ? identity.projectId : '';
  const pluginName = identity.scope === 'plugin' ? identity.pluginName : '';
  const marketplaceName = identity.scope === 'plugin' ? identity.marketplaceName : '';
  const batchKey = [
    identity.scope,
    projectId,
    pluginName,
    marketplaceName,
    identity.skillName,
    response.iteration,
  ].join('|');
  const runId = `eval:${batchKey}`;
  openRunTab({
    runId,
    runKind: 'eval',
    label: `Eval · ${identity.skillName} · iter ${response.iteration}`,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function identityToRequest(identity: SkillTabIdentity): {
  scope: SkillTabIdentity['scope'];
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
} {
  if (identity.scope === 'project') {
    return {
      scope: 'project',
      skillName: identity.skillName,
      projectId: identity.projectId,
    };
  }
  if (identity.scope === 'plugin') {
    return {
      scope: 'plugin',
      skillName: identity.skillName,
      pluginName: identity.pluginName,
      marketplaceName: identity.marketplaceName,
    };
  }
  return { scope: identity.scope, skillName: identity.skillName };
}
