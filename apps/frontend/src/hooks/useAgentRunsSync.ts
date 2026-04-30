import type {
  AgentRun,
  AgentRunStatus,
  AuditRun,
  AuditRunStatus,
  EvalRunStatus,
  SkillEvalRun,
} from '@nakiros/shared';

import { agentRunStore } from '../lib/agent-run-store';
import { computeEvalBatchKey } from '../lib/eval-batch-key';
import { usePolling } from './usePolling';

// ── Status maps ─────────────────────────────────────────────────────────────

const AUDIT_STATUS_MAP: Record<AuditRunStatus, AgentRunStatus> = {
  starting: 'pending',
  running: 'running',
  waiting_for_input: 'awaiting_input',
  completed: 'done',
  failed: 'failed',
  stopped: 'cancelled',
};

const EVAL_STATUS_MAP: Record<EvalRunStatus, AgentRunStatus> = {
  queued: 'pending',
  starting: 'pending',
  running: 'running',
  waiting_for_input: 'awaiting_input',
  grading: 'running',
  completed: 'done',
  failed: 'failed',
  stopped: 'cancelled',
};

// ── audit / fix / create — same AuditRun shape, slightly different titles ──

function auditLikeToAgentRun(
  run: AuditRun,
  kind: AgentRun['kind'],
  titlePrefix: string,
): AgentRun {
  return {
    id: run.runId,
    kind,
    title: `${titlePrefix} · ${run.skillName}`,
    target: {
      type: 'skill',
      scope: run.scope,
      skillName: run.skillName,
      projectId: run.projectId,
      pluginName: run.pluginName,
      marketplaceName: run.marketplaceName,
    },
    status: AUDIT_STATUS_MAP[run.status],
    startedAt: run.startedAt,
    endedAt: run.finishedAt ?? undefined,
    capabilities: {
      canSendMessage: true,
      canApprove: false,
      canStop: true,
    },
    tokensUsed: run.tokensUsed,
  };
}

// ── eval — grouped by (skill, iteration) so a 5-run batch shows one row ────

/**
 * Wrapper around the canonical `computeEvalBatchKey` helper — exists so the
 * sync layer can adapt a `SkillEvalRun` to the helper's shape without
 * duplicating the join logic (which used to drift from `launchEvalBatch`
 * and break the freshly-opened tab — see [lib/eval-batch-key.ts]).
 */
function batchKey(run: SkillEvalRun): string {
  return computeEvalBatchKey({
    scope: run.scope,
    skillName: run.skillName,
    iteration: run.iteration,
    projectId: run.projectId,
    pluginName: run.pluginName,
    marketplaceName: run.marketplaceName,
    fixRunId: run.fixRunId,
  });
}

function aggregateEvalStatus(runs: SkillEvalRun[]): AgentRunStatus {
  const mapped = runs.map((r) => EVAL_STATUS_MAP[r.status]);
  if (mapped.includes('running')) return 'running';
  if (mapped.includes('awaiting_input')) return 'awaiting_input';
  if (mapped.includes('pending')) return 'pending';
  if (mapped.includes('failed')) return 'failed';
  if (mapped.includes('cancelled')) return 'cancelled';
  return 'done';
}

function evalBatchToAgentRun(runs: SkillEvalRun[]): AgentRun {
  const head = runs[0]!;
  const earliestStarted = runs
    .map((r) => r.startedAt)
    .sort()[0]!;
  const allEnded = runs.every((r) => r.finishedAt);
  const latestEnded = allEnded
    ? runs.map((r) => r.finishedAt!).sort().slice(-1)[0]
    : undefined;
  const totalTokens = runs.reduce((acc, r) => acc + (r.tokensUsed ?? 0), 0);

  // Baseline-only batches (only `without_skill` runs) use a Date.now()-based
  // iteration server-side as a unique batch key. We don't want to surface
  // that giant timestamp to users — show "Baseline" instead of "iter X".
  const isBaselineOnly = runs.every((r) => r.config === 'without_skill');
  const title = isBaselineOnly
    ? `Baseline · ${head.skillName} (${runs.length})`
    : `Eval · ${head.skillName} · iter ${head.iteration} (${runs.length})`;

  return {
    id: `eval:${batchKey(head)}`,
    kind: 'eval',
    title,
    target: {
      type: 'skill',
      scope: head.scope,
      skillName: head.skillName,
      projectId: head.projectId,
      pluginName: head.pluginName,
      marketplaceName: head.marketplaceName,
    },
    status: aggregateEvalStatus(runs),
    startedAt: earliestStarted,
    endedAt: latestEnded,
    capabilities: {
      canSendMessage: true,
      canApprove: false,
      canStop: true,
    },
    tokensUsed: totalTokens,
    meta: {
      kind: 'eval',
      runIds: runs.map((r) => r.runId),
      iteration: head.iteration,
      ...(head.createRunId ? { createRunId: head.createRunId } : {}),
    },
  };
}

function groupEvalRuns(runs: SkillEvalRun[]): AgentRun[] {
  const batches = new Map<string, SkillEvalRun[]>();
  for (const run of runs) {
    const key = batchKey(run);
    const list = batches.get(key) ?? [];
    list.push(run);
    batches.set(key, list);
  }
  return Array.from(batches.values()).map(evalBatchToAgentRun);
}

/**
 * Mount this once at the app shell to keep `agentRunStore` mirrored with
 * the daemon's active runs across every kind. Audit / fix / create map
 * one-to-one onto an `AgentRun`; eval runs are grouped by `(skill,
 * iteration)` so a batch surfaces as a single drawer entry whose meta
 * carries the constituent runIds for the EvalRunsView overlay.
 *
 * Runs that disappear from the daemon's active list are not deleted —
 * `agentRunStore.syncKind` transitions them to `done` so the topbar can
 * flag "something just finished" until the user dismisses them.
 */
export function useAgentRunsSync(): void {
  usePolling(async () => {
    // listAll* — active + recently-terminal — so the drawer can surface
    // completed runs the daemon restored from disk and let the user
    // dismiss them once acknowledged. The store filters out anything in
    // its dismissed-ids localStorage entry on every upsert.
    const [audits, fixes, creates, evals] = await Promise.all([
      window.nakiros.listAllAuditRuns(),
      window.nakiros.listAllFixRuns(),
      window.nakiros.listAllCreateRuns(),
      window.nakiros.listEvalRuns(),
    ]);
    agentRunStore.syncKind('audit', audits.map((r) => auditLikeToAgentRun(r, 'audit', 'Audit')));
    agentRunStore.syncKind('fix', fixes.map((r) => auditLikeToAgentRun(r, 'fix', 'Fix')));
    agentRunStore.syncKind('create', creates.map((r) => auditLikeToAgentRun(r, 'create', 'Create')));
    agentRunStore.syncKind('eval', groupEvalRuns(evals));
  }, 2000);
}
