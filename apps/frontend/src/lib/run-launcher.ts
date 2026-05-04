import type { AuditRun, ClaudeMdRunMode, HooksRunMode, McpRunMode, PermissionsExpertScope, PermissionsRunMode, RulesRunMode, SubagentsRunMode } from '@nakiros/shared';
import type { SkillTabIdentity } from '../hooks/useTabs';
import { computeEvalRunId } from './eval-batch-key';

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
  runKind: 'audit' | 'fix' | 'create' | 'eval' | 'classify-convo';
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

/**
 * Start an audit / fix / create run that targets the project-root `./CLAUDE.md`
 * via the bundled `nakiros-claudemd-expert`. Reuses the same `startAudit` /
 * `startFix` / `startCreate` IPC channels as skill runs — only the request
 * carries an extra `claudemdTarget` so the runner switches its slash-command
 * and the frontend store displays a CLAUDE.md-focused title.
 */
export async function launchClaudemd(
  request: { projectId: string; projectPath: string; mode: ClaudeMdRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-claudemd-expert',
    projectId: request.projectId,
    claudemdTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      mode: request.mode,
    },
  };

  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: 'Audit · CLAUDE.md' });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: 'Fix · CLAUDE.md' });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: 'Create · CLAUDE.md' });
  }
}

/**
 * Start an audit / fix / create run that targets a specific `.claude/rules/<ruleName>`
 * via the bundled `nakiros-rules-expert`. Reuses the same `startAudit` /
 * `startFix` IPC channels as skill runs — only the request carries an extra
 * `rulesTarget` so the runner switches its slash-command and the frontend store
 * displays a rules-focused title.
 */
export async function launchRules(
  request: { projectId: string; projectPath: string; ruleName: string; mode: RulesRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-rules-expert',
    projectId: request.projectId,
    rulesTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      ruleName: request.ruleName,
      mode: request.mode,
    },
  };

  const shortName = request.ruleName.replace(/\.md$/i, '');
  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: `Audit · ${shortName}` });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: `Fix · ${shortName}` });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: `Create · ${shortName}` });
  }
}

/**
 * Start an audit / fix / create run that targets a specific `.claude/agents/<subagentName>`
 * via the bundled `nakiros-subagents-expert`. Reuses the same `startAudit` /
 * `startFix` IPC channels as skill runs — only the request carries an extra
 * `subagentsTarget` so the runner switches its slash-command and the frontend
 * store displays a subagents-focused title.
 */
export async function launchSubagents(
  request: { projectId: string; projectPath: string; subagentName: string; mode: SubagentsRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-subagents-expert',
    projectId: request.projectId,
    subagentsTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      subagentName: request.subagentName,
      mode: request.mode,
    },
  };

  const shortName = request.subagentName.replace(/\.md$/i, '');
  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: `Audit · ${shortName}` });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: `Fix · ${shortName}` });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: `Create · ${shortName}` });
  }
}

/**
 * Start an audit / fix / create run that targets the `.claude/settings.json`
 * hooks block via the bundled `nakiros-hooks-expert`. Singleton per project —
 * no `name` field (unlike rules or subagents). Reuses the same `startAudit` /
 * `startFix` IPC channels as skill runs — only the request carries an extra
 * `hooksTarget` so the runner switches its slash-command and the frontend store
 * displays a hooks-focused title.
 */
export async function launchHooks(
  request: { projectId: string; projectPath: string; mode: HooksRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-hooks-expert',
    projectId: request.projectId,
    hooksTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      mode: request.mode,
    },
  };

  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: 'Audit · Hooks' });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: 'Fix · Hooks' });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: 'Create · Hooks' });
  }
}

/**
 * Start an audit / fix / create run that targets the `.claude/settings.json`
 * permissions block via the bundled `nakiros-permissions-expert`. Singleton
 * per project — no `name` field (unlike rules or subagents). Reuses the same
 * `startAudit` / `startFix` IPC channels as skill runs — only the request
 * carries an extra `permissionsTarget` so the runner switches its slash-command
 * and the frontend store displays a permissions-focused title.
 */
export async function launchPermissions(
  request: { projectId: string; projectPath: string; scope: PermissionsExpertScope; mode: PermissionsRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const scopeSuffix = request.scope === 'local' ? ' (local)' : '';
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-permissions-expert',
    projectId: request.projectId,
    permissionsTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      scope: request.scope,
      mode: request.mode,
    },
  };

  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: `Audit · Permissions${scopeSuffix}` });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: `Fix · Permissions${scopeSuffix}` });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: `Create · Permissions${scopeSuffix}` });
  }
}

/**
 * Start an audit / fix / create run that targets the project-root `.mcp.json`
 * file via the bundled `nakiros-mcp-expert`. Singleton per project — no `name`
 * field (unlike rules or subagents). Reuses the same `startAudit` / `startFix`
 * IPC channels as skill runs — only the request carries an extra `mcpTarget` so
 * the runner switches its slash-command and the frontend store displays an
 * mcp-focused title.
 */
export async function launchMcp(
  request: { projectId: string; projectPath: string; mode: McpRunMode },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const baseRequest = {
    scope: 'nakiros-bundled' as const,
    skillName: 'nakiros-mcp-expert',
    projectId: request.projectId,
    mcpTarget: {
      projectId: request.projectId,
      projectPath: request.projectPath,
      mode: request.mode,
    },
  };

  if (request.mode === 'audit') {
    const run = await window.nakiros.startAudit(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'audit', label: 'Audit · MCP' });
  } else if (request.mode === 'fix') {
    const run = await window.nakiros.startFix(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'fix', label: 'Fix · MCP' });
  } else {
    const run = await window.nakiros.startCreate(baseRequest);
    openRunTab({ runId: run.runId, runKind: 'create', label: 'Create · MCP' });
  }
}

/**
 * Start a `classify-convo` run on a Claude Code conversation and open its
 * dedicated RunScreen tab. Used by the conversations drawer's "Frictions" tab.
 */
export async function launchClassifyConvo(
  request: { projectId: string; sessionId: string },
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const run = await window.nakiros.startClassifyConvo(request);
  openRunTab({
    runId: run.runId,
    runKind: 'classify-convo',
    label: `Classify · ${request.sessionId.slice(0, 8)}`,
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

  // Use the canonical helper so the tab id matches the AgentRun id the
  // store derives in `useAgentRunsSync`. Baseline-only runs use a
  // Date.now()-based iteration server-side (see eval-runner.ts) to stay
  // unique per batch — the same key formula works for both flavours.
  const runId = computeEvalRunId({
    scope: identity.scope,
    skillName: identity.skillName,
    iteration: response.iteration,
    projectId: identity.scope === 'project' ? identity.projectId : undefined,
    pluginName: identity.scope === 'plugin' ? identity.pluginName : undefined,
    marketplaceName:
      identity.scope === 'plugin' ? identity.marketplaceName : undefined,
    // No `fixRunId`: prod batches always pass an empty trailing segment.
  });
  openRunTab({
    runId,
    runKind: 'eval',
    label: options.baselineOnly
      ? `Baseline · ${identity.skillName}`
      : `Eval · ${identity.skillName} · iter ${response.iteration}`,
  });
}

/**
 * Kick off an eval batch against a fix run's temp sandbox copy and open the
 * resulting eval tab. Same flow as {@link launchEvalBatch} but routed through
 * `runFixEvalsInTemp` so the runs target the in-progress skill copy. Always
 * runs `with_skill` only — baselines are out of scope for the fix→eval loop.
 */
export async function launchFixEval(
  fixRun: AuditRun,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const response = await window.nakiros.runFixEvalsInTemp({
    runId: fixRun.runId,
    includeBaseline: false,
  });
  // Tab id must match `useAgentRunsSync.batchKey` — including the
  // `fixRunId` discriminator, otherwise the freshly-opened tab stays on
  // "Loading…" or picks up a dismissed prod batch with the same iter
  // number. Using the shared helper guarantees alignment.
  const runId = computeEvalRunId({
    scope: fixRun.scope,
    skillName: fixRun.skillName,
    iteration: response.iteration,
    projectId: fixRun.scope === 'project' ? fixRun.projectId : undefined,
    pluginName: fixRun.scope === 'plugin' ? fixRun.pluginName : undefined,
    marketplaceName:
      fixRun.scope === 'plugin' ? fixRun.marketplaceName : undefined,
    fixRunId: fixRun.runId,
  });
  openRunTab({
    runId,
    runKind: 'eval',
    label: `Eval · ${fixRun.skillName} · iter ${response.iteration}`,
  });
}

/**
 * Kick off an eval batch against a create run's draft sandbox and open
 * the resulting eval tab. Same shape as {@link launchFixEval} but routed
 * through `create:runEvals`. The eval runner writes its iterations
 * inside the draft folder (the runner override forces it) so they live
 * with the sandbox until Apply & deploy syncs the whole tree to
 * `.claude/skills/<name>/`.
 */
export async function launchCreateEval(
  createRun: AuditRun,
  openRunTab: OpenRunTabCallback,
): Promise<void> {
  const response = await window.nakiros.runCreateEvals({ runId: createRun.runId });
  const runId = computeEvalRunId({
    scope: createRun.scope,
    skillName: createRun.skillName,
    iteration: response.iteration,
    projectId: createRun.scope === 'project' ? createRun.projectId : undefined,
    pluginName: createRun.scope === 'plugin' ? createRun.pluginName : undefined,
    marketplaceName:
      createRun.scope === 'plugin' ? createRun.marketplaceName : undefined,
  });
  openRunTab({
    runId,
    runKind: 'eval',
    label: `Eval · ${createRun.skillName} · iter ${response.iteration}`,
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
