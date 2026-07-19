import type {
  AgentRun,
  AgentRunStatus,
  AuditRun,
  AuditRunStatus,
  BootstrapRun,
  BootstrapRunStatus,
  ClassifyConvoRun,
  ClassifyConvoRunStatus,
  EvalRunStatus,
  SkillEvalRun,
} from '@nakiros/shared';

import { agentRunStore } from '../lib/agent-run-store';
import { computeEvalBatchKey } from '../lib/eval-batch-key';
import i18n from '../i18n';
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

/**
 * `awaiting_approval` maps to `awaiting_input` — from the dock's point of
 * view it's the same "the user must act before this run can continue"
 * state as a chat-style `waiting_for_input`, so it lands in the same
 * "Waiting for input" group. `executing` maps to `running` — the writer
 * dispatch runs synchronously as part of approval, so `executing` is
 * normally a brief transitional state (not something the user needs to
 * act on) before the run flips to `completed`/`failed`.
 */
const BOOTSTRAP_STATUS_MAP: Record<BootstrapRunStatus, AgentRunStatus> = {
  starting: 'pending',
  running: 'running',
  waiting_for_input: 'awaiting_input',
  awaiting_approval: 'awaiting_input',
  executing: 'running',
  completed: 'done',
  failed: 'failed',
  stopped: 'cancelled',
};

/**
 * Adapts a `BootstrapRun` (Project `.claude` Bootstrap,
 * `docs/redesign/features/project-bootstrap.md`) into the generic
 * `AgentRun` shape so it surfaces in the topbar `RunDock` like every other
 * kind. Title is a constant ("Project Bootstrap") rather than
 * `Bootstrap · <name>` — bootstrap has no per-entity name, it targets the
 * whole project; `RunDock.resolveTargetLabel` already resolves the
 * project name from `target.projectId` for display.
 */
function bootstrapToAgentRun(run: BootstrapRun): AgentRun {
  return {
    id: run.runId,
    kind: 'bootstrap',
    title: 'Project Bootstrap',
    target: {
      type: 'bootstrap',
      projectId: run.projectId,
      projectPath: run.projectPath,
    },
    status: BOOTSTRAP_STATUS_MAP[run.status],
    startedAt: run.startedAt,
    endedAt: run.finishedAt ?? undefined,
    capabilities: {
      canSendMessage: true,
      canApprove: true,
      canStop: true,
    },
    tokensUsed: run.tokensUsed,
  };
}

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
    const filename = ct.provider === 'codex' ? 'AGENTS.md' : 'CLAUDE.md';
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · ${filename}`,
      target: {
        type: 'claudemd',
        projectId: ct.projectId,
        projectPath: ct.projectPath,
        provider: ct.provider,
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
        provider: rt.provider,
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
        provider: st.provider,
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

  if (run.codexConfigTarget) {
    const target = run.codexConfigTarget;
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · Codex config`,
      target: {
        type: 'codex-config',
        projectId: target.projectId,
        projectPath: target.projectPath,
        provider: 'codex',
        mode: target.mode,
      },
      status: AUDIT_STATUS_MAP[run.status],
      startedAt: run.startedAt,
      endedAt: run.finishedAt ?? undefined,
      capabilities: { canSendMessage: true, canApprove: false, canStop: true },
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
        provider: ht.provider,
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
        provider: pt.provider,
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

  // Runs that target the .mcp.json (Claude) / config.toml (Codex) file (via
  // `nakiros-mcp-expert`) surface with an mcp-focused title and an `mcp`
  // target type. Singleton — no sub-name. A Codex-provider run gets a
  // " · Codex" suffix so it's distinguishable from a Claude one in the dock.
  if (run.mcpTarget) {
    const mt = run.mcpTarget;
    const providerSuffix =
      mt.provider === 'codex' ? i18n.t('runs:titles.providerCodexSuffix') : '';
    return {
      id: run.runId,
      kind,
      title: `${titlePrefix} · MCP${providerSuffix}`,
      target: {
        type: 'mcp',
        projectId: mt.projectId,
        projectPath: mt.projectPath,
        mode: mt.mode,
        provider: mt.provider,
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

// ── Per-family failure isolation ────────────────────────────────────────────

/**
 * Kinds that have logged a sync failure on the current streak — gates the
 * `console.warn` below to "once per failure streak" instead of every 2s
 * poll tick, and is cleared as soon as that family's call succeeds again
 * (logging a one-line recovery notice) so a later, *different* outage on
 * the same family still gets reported.
 */
const failedFamilies = new Set<string>();

/**
 * Applies `onOk` to a settled `Promise.allSettled` result for one run
 * family, or logs (once-ish) and skips it on rejection — used so a single
 * failing `window.nakiros.listAll*` call (e.g. an old daemon in service
 * mode that predates the `bootstrap:*` IPC family during a version skew)
 * can't take down sync for every other kind. Before this helper, all
 * seven calls below were a single `Promise.all`: one rejection threw out
 * of the polled callback before any `agentRunStore.syncKind` call ran,
 * so *nothing* synced — repeating every 2s as an unhandled rejection.
 *
 * Deliberately does NOT call `syncKind(kind, [])` on failure — that would
 * make the store think the family now has zero runs and flip any
 * in-flight one to `done`, which is worse than just leaving last-known
 * state alone until the next successful tick.
 */
function syncFamily<T>(
  kind: string,
  result: PromiseSettledResult<T[]>,
  onOk: (data: T[]) => void,
): void {
  if (result.status === 'fulfilled') {
    if (failedFamilies.delete(kind)) {
      console.info(`[useAgentRunsSync] ${kind} sync recovered`);
    }
    onOk(result.value);
    return;
  }
  if (!failedFamilies.has(kind)) {
    failedFamilies.add(kind);
    console.warn(`[useAgentRunsSync] ${kind} sync failed — leaving its runs as-is until it recovers`, result.reason);
  }
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
    //
    // `allSettled` (not `all`) + per-family `syncFamily` below: each of
    // the seven kinds syncs independently, so one rejecting call never
    // stops the other six from updating (see `syncFamily`'s doc comment).
    const [auditsR, fixesR, createsR, editsR, evalsR, classifyConvosR, bootstrapsR] = await Promise.allSettled([
      window.nakiros.listAllAuditRuns(),
      window.nakiros.listAllFixRuns(),
      window.nakiros.listAllCreateRuns(),
      window.nakiros.listAllEditRuns(),
      window.nakiros.listEvalRuns(),
      window.nakiros.listAllClassifyConvoRuns(),
      window.nakiros.listAllBootstrapRuns(),
    ]);
    syncFamily('audit', auditsR, (audits) =>
      agentRunStore.syncKind('audit', audits.map((r) => auditLikeToAgentRun(r, 'audit', 'Audit'))),
    );
    syncFamily('fix', fixesR, (fixes) =>
      agentRunStore.syncKind('fix', fixes.map((r) => auditLikeToAgentRun(r, 'fix', 'Fix'))),
    );
    syncFamily('create', createsR, (creates) =>
      agentRunStore.syncKind('create', creates.map((r) => auditLikeToAgentRun(r, 'create', 'Create'))),
    );
    syncFamily('edit', editsR, (edits) =>
      agentRunStore.syncKind('edit', edits.map((r) => auditLikeToAgentRun(r, 'edit', 'Edit'))),
    );
    syncFamily('eval', evalsR, (evals) => agentRunStore.syncKind('eval', groupEvalRuns(evals)));
    syncFamily('classify-convo', classifyConvosR, (classifyConvos) =>
      agentRunStore.syncKind('classify-convo', classifyConvos.map(classifyConvoToAgentRun)),
    );
    syncFamily('bootstrap', bootstrapsR, (bootstraps) =>
      agentRunStore.syncKind('bootstrap', bootstraps.map(bootstrapToAgentRun)),
    );
  }, 2000);
}
