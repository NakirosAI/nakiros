import type { SkillScope } from '@nakiros/shared';

/**
 * Identity fields required to compute an eval batch's stable key. The
 * shape covers both prod batches (`fixRunId` omitted) and fix-temp
 * batches launched via `launchFixEval` (`fixRunId` populated).
 */
export interface EvalBatchIdentity {
  scope: SkillScope;
  skillName: string;
  iteration: number;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  /**
   * Set when this batch was launched from a fix session. Disambiguates
   * fix-temp batches (per-fix-session iter counter starting at 1) from
   * prod batches that happen to share the same iter number — without
   * it, `dismissedIds` for a prod batch could shadow a live fix-temp
   * batch with identical numbers.
   */
  fixRunId?: string;
}

/**
 * Single source of truth for the eval batch key. Used by:
 *   - `useAgentRunsSync` to register the AgentRun in the store
 *   - `launchEvalBatch` / `launchFixEval` to derive the tab's `runId`
 *   - any code that needs to reconcile a tab id with a store entry
 *
 * The two sites used to inline the join independently and a missing
 * `fixRunId ?? ''` segment in one of them produced a 6-vs-7-segment
 * mismatch that left the freshly-opened eval tab on "Loading…" forever
 * (the tab id never matched the registered AgentRun id, since the store
 * is populated from a 2s polling loop in `useAgentRunsSync`). Centralised
 * here so this divergence can't recur.
 */
export function computeEvalBatchKey(identity: EvalBatchIdentity): string {
  return [
    identity.scope,
    identity.projectId ?? '',
    identity.pluginName ?? '',
    identity.marketplaceName ?? '',
    identity.skillName,
    identity.iteration,
    identity.fixRunId ?? '',
  ].join('|');
}

/** Convenience: prepend the `eval:` namespace used by `agentRunStore`. */
export function computeEvalRunId(identity: EvalBatchIdentity): string {
  return `eval:${computeEvalBatchKey(identity)}`;
}
