import type {
  AgentRun,
  AgentRunStatus,
  AuditRun,
  AuditRunStatus,
  ClassifyConvoRun,
  ClassifyConvoRunStatus,
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

const CLASSIFY_CONVO_STATUS_MAP: Record<ClassifyConvoRunStatus, AgentRunStatus> = {
  starting: 'pending',
  running: 'running',
  waiting_for_input: 'awaiting_input',
  completed: 'done',
  failed: 'failed',
  stopped: 'cancelled',
};


function classifyConvoToAgentRun(run: ClassifyConvoRun): AgentRun {
  return {
    id: run.runId,
    kind: 'classify-convo',
    title: `Classify · ${run.sourceSessionId.slice(0, 8)}`,
    target: {
      type: 'conversation',
      projectId: run.projectId,
      // Identify the SOURCE conversation, not the spawned sub-run's session id.
      sessionId: run.sourceSessionId,
    },
    status: CLASSIFY_CONVO_STATUS_MAP[run.status],
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

// ── audit / fix / create — same AuditRun shape, slightly different titles ──

function auditLikeToAgentRun(
  run: AuditRun,
  kind: AgentRun['kind'],
  titlePrefix: string,
): AgentRun {
  // Runs that target a CLAUDE.md (via the bundled `nakiros-claudemd-expert`)
  // surface as audit/fix/create runs with a different target shape and a
  // CLAUDE.md-focused title — kind stays unchanged so the entire RunScreen
  // pipeline reuses without modification.
  if (run.claudemdTarget) {
    const ct = run.claudemdTarget;
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · CLAUDE.md`,
      target: {
        type: 'claudemd',
        projectId: ct.projectId,
        projectPath: ct.projectPath,
        mode: ct.mode,
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

  // Runs that target a rules file (via `nakiros-rules-expert`) surface with
  // a rules-focused title and a `rules` target type.
  if (run.rulesTarget) {
    const rt = run.rulesTarget;
    const shortName = rt.ruleName.replace(/\.md$/i, '');
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · ${shortName}`,
      target: {
        type: 'rules',
        projectId: rt.projectId,
        projectPath: rt.projectPath,
        ruleName: rt.ruleName,
        mode: rt.mode,
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

  // Runs that target a subagent file (via `nakiros-subagents-expert`) surface
  // with a subagents-focused title and a `subagents` target type.
  if (run.subagentsTarget) {
    const st = run.subagentsTarget;
    const shortName = st.subagentName.replace(/\.md$/i, '');
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · ${shortName}`,
      target: {
        type: 'subagents',
        projectId: st.projectId,
        projectPath: st.projectPath,
        subagentName: st.subagentName,
        mode: st.mode,
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

  // Runs that target the hooks block (via `nakiros-hooks-expert`) surface with
  // a hooks-focused title and a `hooks` target type. Singleton — no sub-name.
  if (run.hooksTarget) {
    const ht = run.hooksTarget;
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · Hooks`,
      target: {
        type: 'hooks',
        projectId: ht.projectId,
        projectPath: ht.projectPath,
        mode: ht.mode,
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

  // Runs that target the permissions block (via `nakiros-permissions-expert`)
  // surface with a permissions-focused title and a `permissions` target type.
  // Include the scope label in the title when it's 'local' so the user can
  // distinguish a project run from a local run at a glance.
  if (run.permissionsTarget) {
    const pt = run.permissionsTarget;
    const scopeSuffix = (pt.scope ?? 'project') === 'local' ? ' (local)' : '';
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · Permissions${scopeSuffix}`,
      target: {
        type: 'permissions',
        projectId: pt.projectId,
        projectPath: pt.projectPath,
        scope: pt.scope ?? 'project',
        mode: pt.mode,
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

  // Runs that target the .mcp.json file (via `nakiros-mcp-expert`) surface
  // with an mcp-focused title and an `mcp` target type. Singleton — no sub-name.
  if (run.mcpTarget) {
    const mt = run.mcpTarget;
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · MCP`,
      target: {
        type: 'mcp',
        projectId: mt.projectId,
        projectPath: mt.projectPath,
        mode: mt.mode,
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

  // Runs that target an output-style file (via `nakiros-output-styles-expert`)
  // surface with an output-style-focused title and an `output-styles` target
  // type. Collection — one run per style file.
  if (run.outputStylesTarget) {
    const ost = run.outputStylesTarget;
    const shortName = ost.styleName.replace(/\.md$/i, '');
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · ${shortName}`,
      target: {
        type: 'output-styles',
        projectId: ost.projectId,
        projectPath: ost.projectPath,
        styleName: ost.styleName,
        mode: ost.mode,
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
    const [audits, fixes, creates, evals, classifyConvos] = await Promise.all([
      window.nakiros.listAllAuditRuns(),
      window.nakiros.listAllFixRuns(),
      window.nakiros.listAllCreateRuns(),
      window.nakiros.listEvalRuns(),
      window.nakiros.listAllClassifyConvoRuns(),
    ]);
    agentRunStore.syncKind('audit', audits.map((r) => auditLikeToAgentRun(r, 'audit', 'Audit')));
    agentRunStore.syncKind('fix', fixes.map((r) => auditLikeToAgentRun(r, 'fix', 'Fix')));
    agentRunStore.syncKind('create', creates.map((r) => auditLikeToAgentRun(r, 'create', 'Create')));
    agentRunStore.syncKind('eval', groupEvalRuns(evals));
    agentRunStore.syncKind('classify-convo', classifyConvos.map(classifyConvoToAgentRun));
  }, 2000);
}
