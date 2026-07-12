import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

import type {
  ApproveBootstrapPlanRequest,
  BootstrapEntityProposal,
  BootstrapRun,
  BootstrapRunEvent,
  BootstrapRunStatus,
  BootstrapTimelineEntry,
  ConversationDigest,
  FixUsage,
  ProjectBootstrapPlan,
  RecommendationArtifactType,
  StartBootstrapRequest,
} from '@nakiros/shared';

import {
  buildChatTimeline,
  cleanupRunWorkdir,
  computeSessionUsage,
  createRunner,
  createRunWorktree,
  destroyEvalSandbox,
  findGitRoot,
  getSessionJsonlPath,
  isActiveRunStatus,
  persistRunJson,
  type RehydrateResult,
  type RunEntry,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { buildDotClaudeSnapshot } from './dot-claude-snapshot-builder.js';
import { isHookInstalled } from './conversation-ingest/hook-installer.js';
import { isWatcherRunning } from './conversation-ingest/watcher.js';
import { listDigestsForProject, loadDigest } from './conversation-ingest/classifier.js';
import { dispatchBootstrapPlan } from './bootstrap-dispatch.js';

/**
 * Bootstrap runner — the interactive plan → discuss → approve → execute
 * lifecycle for the Project `.claude` Bootstrap feature
 * (`docs/redesign/features/project-bootstrap.md`).
 *
 * Modeled directly on `audit-runner.ts`: same worktree strategy (real
 * codebase access for the agent, Nakiros artefacts kept in `workdir`), same
 * `dot-claude-snapshot.json` injection, same `waiting_for_input` streaming.
 * The 20% delta is bootstrap-specific:
 *
 * - No progress-polling timer. Unlike audit's `outputs/audit-manifest.json` +
 *   `outputs/audit-progress.jsonl` (written incrementally mid-turn), the
 *   `nakiros-project-bootstrap` skill writes a single `plan.json` once per
 *   turn (see its `references/plan-format.md`) — read once in
 *   `onTurnComplete`, no interval needed.
 * - Two extra resting states, `awaiting_approval` and `executing` (added to
 *   the shared `RunStatus` union in `runner-core/runner.ts`, same pattern as
 *   eval's `grading`). `waiting_for_input` is reserved for turns where the
 *   agent asked a genuine clarifying question (plan unchanged);
 *   `awaiting_approval` is entered whenever `plan.json`'s `generatedAt`
 *   moved — the ball is in the user's court, whether or not they choose to
 *   discuss further before approving.
 * - Optional friction-digest enrichment (`friction-digests.json`) — written
 *   only when conversation-ingest is enabled AND the project has at least
 *   one digest with frictions. Absence is silent — the skill's SKILL.md
 *   documents that this is enrichment, never a requirement.
 * - The execute phase (`bootstrap:approvePlan`) applies the user's
 *   per-proposal decisions, transitions the run to `executing`, then
 *   dispatches every accepted proposal to its per-entity writer via
 *   `bootstrap-dispatch.ts` (step 5 of the feature's build order — no new
 *   write path, same writers the sister `.claude/` experts and V2 editors
 *   use). See {@link dispatchApprovedProposals} for the exact wiring.
 */

const BOOTSTRAP_SKILL_NAME = 'nakiros-project-bootstrap';
const KIND = 'bootstrap';
const MAX_FRICTION_DIGESTS = 20;

const VALID_ARTIFACT_TYPES: RecommendationArtifactType[] = [
  'rules',
  'skill',
  'claudemd',
  'subagent',
  'hook',
  'permission',
  'mcp',
  'output-style',
];
const VALID_PROPOSAL_STATUSES: BootstrapEntityProposal['status'][] = [
  'pending',
  'accepted',
  'rejected',
  'written',
  'failed',
];

function bootstrapRunsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'bootstrap');
}

/** Extra, non-persisted-as-is bookkeeping kept alongside a `BootstrapRun`. */
interface BootstrapEntryExtras {
  /** Absolute path to the bundled `nakiros-project-bootstrap` skill directory. */
  skillDir: string;
  /**
   * Absolute path to the git worktree used as the Claude subprocess cwd.
   * `null` when the project isn't a git repo (falls back to `workdir`-only,
   * agent reads the codebase via absolute paths). NOT persisted — rebuilt
   * as `null` at boot, same convention as `AuditEntryExtras.worktreePath`.
   */
  worktreePath: string | null;
  /** Git root that owns the worktree — passed to `destroyEvalSandbox`. NOT persisted. */
  worktreeGitRoot: string | null;
}

type BootstrapEvent = BootstrapRunEvent['event'];

/** Internal start request — `StartBootstrapRequest` + the resolved skill directory. */
interface BootstrapStartReq extends StartBootstrapRequest {
  skillDir: string;
}

// ─── Plan validation ─────────────────────────────────────────────────────────

function isValidProposal(value: unknown): value is BootstrapEntityProposal {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.artifactType === 'string' &&
    VALID_ARTIFACT_TYPES.includes(p.artifactType as RecommendationArtifactType) &&
    typeof p.target === 'string' &&
    typeof p.title === 'string' &&
    typeof p.rationale === 'string' &&
    typeof p.content === 'string' &&
    typeof p.status === 'string' &&
    VALID_PROPOSAL_STATUSES.includes(p.status as BootstrapEntityProposal['status'])
  );
}

/** Structural validation of a freshly-parsed `plan.json` against `ProjectBootstrapPlan`. */
function isValidPlan(value: unknown): value is ProjectBootstrapPlan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.projectId === 'string' &&
    typeof p.projectPath === 'string' &&
    typeof p.generatedAt === 'string' &&
    typeof p.summary === 'string' &&
    typeof p.usedFrictionDigests === 'boolean' &&
    Array.isArray(p.proposals) &&
    p.proposals.every(isValidProposal)
  );
}

/**
 * Read `plan.json` from the agent's effective cwd. Tolerates a missing or
 * malformed file (partial write mid-turn should never happen — the skill
 * writes it in one `Write` call — but a crashed turn could still leave a
 * truncated file behind).
 */
function readPlanFromDisk(contextDir: string): ProjectBootstrapPlan | null {
  const planPath = join(contextDir, 'plan.json');
  if (!existsSync(planPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(planPath, 'utf8'));
    return isValidPlan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Re-read `plan.json` after a turn and decide whether the skill actually
 * touched it this turn (`generatedAt` moved, or first appearance) versus
 * left it untouched (the skill only asked a clarifying question). Mirrors
 * audit's artefact-presence decision (`archiveReport` succeeds or not) —
 * same binary-signal philosophy, different artefact.
 */
function syncBootstrapPlan(entry: RunEntry<BootstrapRun, BootstrapEvent, BootstrapEntryExtras>): {
  planChanged: boolean;
  plan: ProjectBootstrapPlan | null;
} {
  const contextDir = entry.run.cwd ?? entry.run.workdir;
  const plan = readPlanFromDisk(contextDir);
  if (!plan) return { planChanged: false, plan: entry.run.plan };
  const planChanged = entry.run.plan?.generatedAt !== plan.generatedAt;
  return { planChanged, plan };
}

// ─── Friction digest enrichment (optional) ──────────────────────────────────

/**
 * Write `friction-digests.json` into `contextDir` when conversation-ingest
 * is enabled and the project has at least one digest with frictions.
 * Silent no-op otherwise — enrichment, never a requirement (feature doc
 * decision §4). Caps at {@link MAX_FRICTION_DIGESTS} most-recent digests so
 * the file (and the first prompt built from it) stays bounded on projects
 * with a long ingest history.
 *
 * @returns `true` when the file was written, so `buildFirstPrompt` can
 * mention it to the agent.
 */
function writeFrictionDigestsIfAvailable(contextDir: string, projectPath: string): boolean {
  if (!isHookInstalled() || !isWatcherRunning()) return false;

  let summaries;
  try {
    summaries = listDigestsForProject(projectPath);
  } catch {
    return false;
  }
  const withFrictions = summaries.filter((s) => s.status === 'ready' && s.frictionCount > 0);
  if (withFrictions.length === 0) return false;

  withFrictions.sort((a, b) => ((a.generatedAt ?? '') < (b.generatedAt ?? '') ? 1 : -1));
  const picked = withFrictions.slice(0, MAX_FRICTION_DIGESTS);

  const digests: ConversationDigest[] = [];
  for (const summary of picked) {
    const digest = loadDigest(projectPath, summary.sessionId);
    if (digest) digests.push(digest);
  }
  if (digests.length === 0) return false;

  try {
    writeFileSync(
      join(contextDir, 'friction-digests.json'),
      JSON.stringify(
        { projectPath, generatedAt: new Date().toISOString(), sessionCount: digests.length, digests },
        null,
        2,
      ),
      'utf8',
    );
    return true;
  } catch (err) {
    console.warn(`[bootstrap-runner] Could not write friction-digests.json: ${(err as Error).message}`);
    return false;
  }
}

// ─── Boot resumability ───────────────────────────────────────────────────────

/**
 * True when the Claude session file backing this run still lives at the
 * canonical `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` path.
 * Same rationale as audit-runner's equivalent check — collapse to `stopped`
 * rather than offer a broken "Reprendre" when the file is gone.
 */
function bootstrapRunHasResumableSessionFile(blob: { sessionId?: string | null; workdir?: string; cwd?: string | null }, workdir: string): boolean {
  if (!blob.sessionId) return false;
  if (!existsSync(workdir)) return false;
  const sessionBase = blob.cwd ?? workdir;
  return existsSync(getSessionJsonlPath(sessionBase, blob.sessionId));
}

// ─── Plan archival on stop ───────────────────────────────────────────────────

/** Permanent (survives workdir cleanup) archive location for a stopped bootstrap run's plan. */
function bootstrapPlanArchiveDir(projectId: string, runId: string): string {
  return join(homedir(), '.nakiros', projectId, 'bootstrap-plans', runId);
}

/**
 * Rescue `run.plan` to permanent per-project storage before `cleanupOnTerminal`
 * deletes the workdir — the workdir is the plan's ONLY persistence otherwise
 * (`plan.json` lives in the worktree/workdir, and `run.json` is deleted along
 * with everything else `cleanupRunWorkdir` removes). Mirrors audit-runner's
 * `archiveReport` rescue-before-delete pattern. Best-effort: a failure here
 * is logged, never thrown — losing the archive copy must not block the
 * user's Stop action.
 */
function archiveBootstrapPlanOnStop(entry: RunEntry<BootstrapRun, BootstrapEvent, BootstrapEntryExtras>): void {
  const { run } = entry;
  if (!run.plan) return;
  try {
    const archiveDir = bootstrapPlanArchiveDir(run.projectId, run.runId);
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, 'plan.json'), JSON.stringify(run.plan, null, 2), 'utf8');
    writeFileSync(
      join(archiveDir, 'run-summary.json'),
      JSON.stringify(
        {
          runId: run.runId,
          projectId: run.projectId,
          projectPath: run.projectPath,
          statusAtStop: run.status,
          startedAt: run.startedAt,
          stoppedAt: new Date().toISOString(),
          error: run.error,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`[bootstrap-runner] Archived plan for stopped run ${run.runId} to ${archiveDir}`);
  } catch (err) {
    console.warn(`[bootstrap-runner] Could not archive plan on stop for run ${run.runId}: ${(err as Error).message}`);
  }
}

// ─── Workdir preparation ─────────────────────────────────────────────────────

function symlinkSkillInto(dir: string, skillDir: string): void {
  const skillsDir = join(dir, '.claude', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  const linkPath = join(skillsDir, BOOTSTRAP_SKILL_NAME);
  if (!existsSync(linkPath)) {
    symlinkSync(realpathSync(skillDir), linkPath, 'dir');
  }
}

const spec: RunnerSpec<BootstrapRun, BootstrapStartReq, BootstrapEvent, BootstrapEntryExtras> = {
  kind: KIND,
  runsRoot: bootstrapRunsRoot,

  prepareWorkdir(req, runId) {
    if (!existsSync(req.skillDir)) {
      throw new Error(
        `Bootstrap skill directory not found: ${req.skillDir}. Restart the daemon to re-sync ~/.nakiros/skills.`,
      );
    }

    const workdir = join(bootstrapRunsRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    writeExecutionSettings(workdir);
    symlinkSkillInto(workdir, req.skillDir);

    let worktreePath: string | null = null;
    const gitRoot = findGitRoot(req.projectPath);
    if (gitRoot) {
      try {
        const result = createRunWorktree(gitRoot, runId, 'bootstrap');
        worktreePath = result.path;
        writeExecutionSettings(worktreePath);
        symlinkSkillInto(worktreePath, req.skillDir);
      } catch (err) {
        console.warn(`[bootstrap-runner] Could not create worktree for run ${runId}: ${(err as Error).message}. Falling back to workdir-only.`);
        worktreePath = null;
      }
    }

    // Context files (dot-claude-snapshot.json, friction-digests.json) must
    // land wherever the agent's cwd actually is — the worktree when one
    // exists, `workdir` otherwise. Writing them unconditionally into
    // `workdir` (as audit-runner does for its `*Target` snapshots) would
    // make them invisible to the agent once a worktree is in play; see
    // `feedback_bootstrap_context_dir.md` for the full reasoning.
    const contextDir = worktreePath ?? workdir;

    try {
      const snapshot = buildDotClaudeSnapshot({ projectId: req.projectId, projectPath: req.projectPath });
      writeFileSync(join(contextDir, 'dot-claude-snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[bootstrap-runner] Could not write dot-claude-snapshot.json: ${(err as Error).message}`);
    }

    writeFrictionDigestsIfAvailable(contextDir, req.projectPath);

    return {
      workdir,
      extras: {
        skillDir: req.skillDir,
        worktreePath,
        worktreeGitRoot: worktreePath ? gitRoot : null,
      },
    };
  },

  buildFirstPrompt(req, ctx) {
    const contextDir = ctx.extras.worktreePath ?? ctx.workdir;
    const hasDigests = existsSync(join(contextDir, 'friction-digests.json'));
    return [
      `/${BOOTSTRAP_SKILL_NAME} bootstrap`,
      '',
      `Project root: ${req.projectPath}`,
      `dot-claude-snapshot.json is available at the root of your working directory — read it first.`,
      hasDigests
        ? `friction-digests.json is also available at the root of your working directory (conversation-ingest enrichment) — optional, read it after the snapshot.`
        : `No friction digests are available for this project — proceed on the codebase + snapshot alone.`,
      '',
      `Follow the procedure in your SKILL.md and begin now.`,
    ].join('\n');
  },

  createInitialRun(req, runId, workdir, extras): BootstrapRun {
    return {
      runId,
      projectId: req.projectId,
      projectPath: req.projectPath,
      status: 'starting',
      sessionId: null,
      workdir,
      cwd: extras?.worktreePath ?? undefined,
      plan: null,
      turns: [],
      tokensUsed: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
  },

  onTurnComplete(entry, helpers) {
    const { planChanged, plan } = syncBootstrapPlan(entry);
    if (plan) {
      entry.run.plan = plan;
      entry.eventLog.emit({ type: 'plan_updated', plan });
    }
    if (planChanged || entry.run.plan) {
      // A plan exists — either this turn just changed it, or it already
      // existed and the agent only answered a clarifying question without
      // touching plan.json. Either way, stay in `awaiting_approval`: once a
      // plan exists the user must always be able to approve it, even if
      // they never "resolve" a pending question first (B4 — approve was a
      // dead-end when a no-op discuss turn demoted the run to
      // `waiting_for_input`, from which `approveBootstrapPlan` used to
      // reject). `canSendUserMessage` already accepts both statuses, so the
      // user can still keep discussing from here regardless.
      transitionToAwaitingApproval(entry);
    } else {
      // Genuinely no plan yet (first turn produced nothing at all) — treat
      // as a clarifying question, wait for the user.
      helpers.wait(entry);
    }
  },

  onTurnFailed(entry) {
    if (entry.extras.worktreePath) {
      destroyEvalSandbox(entry.extras.worktreePath, entry.extras.worktreeGitRoot ?? undefined);
      entry.extras.worktreePath = null;
    }
  },

  cleanupOnTerminal(entry) {
    // Rescue the plan before the workdir (its sole persistence) is deleted.
    // `cleanupOnTerminal` fires on both `stop()` (user hit Stop — possibly
    // mid-discussion, mid-approval-review, with no other copy of the plan
    // anywhere) and `finish()` (user dismissing an already-`completed` run,
    // where the plan's final written/failed state is already the accepted
    // outcome and needs no rescue). Mirrors audit-runner's archive-before-
    // delete pattern for `audit-report.md`.
    if (entry.run.plan && entry.run.status !== 'completed') {
      archiveBootstrapPlanOnStop(entry);
    }
    if (entry.extras.worktreePath) {
      destroyEvalSandbox(entry.extras.worktreePath, entry.extras.worktreeGitRoot ?? undefined);
      entry.extras.worktreePath = null;
      entry.run.cwd = undefined;
    }
    cleanupRunWorkdir(entry.run.workdir);
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.run.projectId === req.projectId && isActiveRunStatus(entry.run.status)) return entry;
    }
    return null;
  },

  // Discussion messages are accepted both while the agent asked a genuine
  // question (`waiting_for_input`) AND while the plan sits ready for review
  // (`awaiting_approval`) — the user can chat at any point before approving.
  canSendUserMessage(entry) {
    return entry.run.status === 'waiting_for_input' || entry.run.status === 'awaiting_approval';
  },

  rehydrate(persisted, workdir): RehydrateResult<BootstrapRun, BootstrapEntryExtras> {
    const blob = persisted as (BootstrapRun & { _extras?: BootstrapEntryExtras }) | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };

    const skillDir = blob._extras?.skillDir;
    if (!skillDir) return { kind: 'cleanup' };

    if (blob.status === 'stopped' || blob.status === 'failed') return { kind: 'cleanup' };

    const wasActive = blob.status === 'starting' || blob.status === 'running';
    const canResume = !wasActive || bootstrapRunHasResumableSessionFile(blob, workdir);
    let restoredStatus: BootstrapRunStatus = wasActive
      ? canResume
        ? 'waiting_for_input'
        : 'stopped'
      : blob.status;
    let restoredError = blob.error ?? null;
    let restoredInterrupted = restoredStatus === 'waiting_for_input' && wasActive ? true : blob.interruptedByReboot;

    // A persisted `executing` means the daemon crashed mid-dispatch.
    // Dispatch is synchronous with no partial-progress checkpoints, so we
    // cannot know which proposals actually got written — resuming verbatim
    // would leave the run permanently wedged (nothing will ever finish an
    // `executing` run that has no live turn or dispatch call behind it).
    // Surface this honestly instead: terminal `failed`, plan preserved so
    // the user can inspect `run.plan` and check the project by hand.
    if (blob.status === 'executing') {
      restoredStatus = 'failed';
      restoredError = 'Daemon restarted while executing this plan — some entities may have already been written. Check the project before retrying.';
      restoredInterrupted = true;
    }

    // A worktree `cwd` that no longer exists on disk (e.g. swept at a prior
    // boot before its keep-set protection existed, or removed out of band)
    // must not be restored verbatim — a future turn would spawn `claude`
    // with a nonexistent cwd and ENOENT. Drop it instead: `executeTurn`
    // falls back to `workdir` (always present), and approval/dispatch never
    // depend on `cwd` at all, so this never blocks approving an
    // already-good plan.
    const cwdAlive = !blob.cwd || existsSync(blob.cwd);
    if (blob.cwd && !cwdAlive) {
      console.warn(`[bootstrap-runner] Worktree for run ${blob.runId} no longer exists (${blob.cwd}) — dropping cwd; discussion (if any) resumes from workdir instead.`);
    }

    const restoredRun: BootstrapRun = {
      runId: blob.runId,
      projectId: blob.projectId,
      projectPath: blob.projectPath,
      status: restoredStatus,
      sessionId: blob.sessionId ?? null,
      workdir,
      cwd: cwdAlive ? (blob.cwd ?? undefined) : undefined,
      plan: blob.plan ?? null,
      turns: Array.isArray(blob.turns) ? blob.turns : [],
      tokensUsed: typeof blob.tokensUsed === 'number' ? blob.tokensUsed : 0,
      durationMs: typeof blob.durationMs === 'number' ? blob.durationMs : 0,
      startedAt: blob.startedAt ?? new Date().toISOString(),
      finishedAt:
        (restoredStatus === 'stopped' && wasActive) || restoredStatus === 'failed'
          ? new Date().toISOString()
          : (blob.finishedAt ?? null),
      error: restoredError,
      interruptedByReboot: restoredInterrupted,
    };

    console.log(`[bootstrap-runner] Restored bootstrap run ${restoredRun.runId} for project ${restoredRun.projectId} (status=${restoredStatus})`);
    return { kind: 'rehydrate', run: restoredRun, extras: { skillDir, worktreePath: null, worktreeGitRoot: null } };
  },
};

/**
 * Transition a run straight to `awaiting_approval` — not one of
 * `PostTurnHelpers`' three transitions (wait / complete / fail), so this
 * mirrors `helpers.wait()`'s internals (guard terminal states, persist,
 * emit `status`) with a different target status. See `runner-core/runner.ts`
 * `RunStatus` for why this value exists on the shared union.
 */
function transitionToAwaitingApproval(entry: RunEntry<BootstrapRun, BootstrapEvent, BootstrapEntryExtras>): void {
  const { run } = entry;
  if (run.status === 'failed' || run.status === 'stopped') return;
  run.status = 'awaiting_approval';
  persistRunJson(run.workdir, { ...run, _extras: entry.extras });
  entry.eventLog.emit({ type: 'status', status: 'awaiting_approval' });
}

/**
 * Step 5 of the feature's build order — execution. Called by
 * `approveBootstrapPlan` right after the run transitions to `executing`.
 * Writes every `accepted` proposal to the REAL project (`run.projectPath`,
 * never `run.cwd`/the worktree) via `dispatchBootstrapPlan`, which routes
 * each proposal to the matching existing per-entity writer — see
 * `bootstrap-dispatch.ts` for the exact mapping and "no new write path"
 * rationale.
 *
 * One failing proposal never aborts the others — `dispatchBootstrapPlan`
 * attempts every accepted proposal and returns per-proposal outcomes. The
 * run itself only reaches `failed` if dispatch crashes before processing
 * anything (defensive; `dispatchProposal` already catches per-proposal
 * errors internally, so this really only guards unexpected bugs). Otherwise
 * the run always reaches `completed`, even with partial failures — the
 * per-proposal `written`/`failed` statuses (and each `error`) carry the
 * detail, and the final `done` event's `error` field carries a one-line
 * summary when at least one proposal failed.
 */
function dispatchApprovedProposals(entry: RunEntry<BootstrapRun, BootstrapEvent, BootstrapEntryExtras>): void {
  const { run } = entry;

  if (!run.plan) {
    // Defensive — approveBootstrapPlan() already guards against this before
    // calling here, but keep this seam self-contained against future callers.
    run.status = 'failed';
    run.error = 'No plan to execute.';
    run.finishedAt = new Date().toISOString();
    persistRunJson(run.workdir, { ...run, _extras: entry.extras });
    entry.eventLog.emit({ type: 'status', status: 'failed' });
    entry.eventLog.emit({ type: 'done', exitCode: 1, error: run.error });
    return;
  }

  let result: ReturnType<typeof dispatchBootstrapPlan>;
  try {
    result = dispatchBootstrapPlan(run.projectPath, run.projectId, run.runId, run.plan.proposals);
  } catch (err) {
    // Dispatch itself blew up before processing any proposal — distinct
    // from a per-proposal failure. Terminal `failed`, not `completed`.
    run.status = 'failed';
    run.error = `Bootstrap execution crashed: ${err instanceof Error ? err.message : String(err)}`;
    run.finishedAt = new Date().toISOString();
    persistRunJson(run.workdir, { ...run, _extras: entry.extras });
    entry.eventLog.emit({ type: 'status', status: 'failed' });
    entry.eventLog.emit({ type: 'done', exitCode: 1, error: run.error });
    return;
  }

  run.plan = { ...run.plan, proposals: result.proposals };
  run.status = 'completed';
  run.finishedAt = new Date().toISOString();
  persistRunJson(run.workdir, { ...run, _extras: entry.extras });
  entry.eventLog.emit({ type: 'plan_updated', plan: run.plan });
  entry.eventLog.emit({ type: 'status', status: 'completed' });

  const { total, written, failed, backups } = result.summary;
  console.log(`[bootstrap-runner] Run ${run.runId}: dispatch complete — ${written}/${total} written, ${failed} failed.`);
  if (backups.length > 0) {
    console.log(
      `[bootstrap-runner] Run ${run.runId}: backed up ${backups.length} pre-existing file(s) before overwrite: ${backups.map((b) => b.path).join(', ')}`,
    );
  }
  entry.eventLog.emit({
    type: 'done',
    exitCode: 0,
    error: failed > 0 ? `${failed}/${total} proposal(s) failed to write — see per-proposal errors in the plan.` : undefined,
  });
}

const runner = createRunner(spec);

// ─── Public API — preserved exports for IPC handlers ────────────────────────

interface RunOpts {
  skillDir: string;
  onEvent(event: BootstrapRunEvent): void;
}

/** Boot recovery. Scans `~/.nakiros/runs/bootstrap/*` and rehydrates or cleans up. */
export function restoreOrCleanupBootstrapWorkdirs(): void {
  runner.restoreOrCleanup(() => {
    /* no broadcast on boot — the live listener will rebind on first IPC call */
  });
}

/**
 * Strip `plan` and `turns` down to a lightweight shape for list payloads —
 * both can carry every proposal's full markdown/JSON `content` plus the
 * entire conversation, which a 2-second dock poll has no use for (it only
 * renders scalars: status, counts, timestamps). `proposalCount` is kept so
 * the dock can still show "N proposals" without the payload. `getRun` and
 * the event stream still carry the real `plan`/`turns` for the run's own
 * screen.
 */
function toListSummary(run: BootstrapRun): BootstrapRun {
  return {
    ...run,
    plan: null,
    turns: [],
    proposalCount: run.plan?.proposals.length,
  };
}

/** List all active (non-terminal) bootstrap runs — lightweight, see {@link toListSummary}. */
export function listActiveBootstrapRuns(): BootstrapRun[] {
  return runner.listActive().map(toListSummary);
}

/** List every bootstrap run currently held in memory — active and terminal, lightweight, see {@link toListSummary}. */
export function listAllBootstrapRuns(): BootstrapRun[] {
  return runner.listAll().map(toListSummary);
}

/**
 * Absolute worktree paths (`cwd`) of bootstrap runs still in an active
 * (resumable) status. Passed into the boot-time `sweepOrphanSandboxes`
 * keep-set (unioned with eval's `getResumableSandboxPaths()` in
 * `server.ts`) so a worktree a rehydrated run still references isn't
 * destroyed out from under it — without this, `awaiting_approval` /
 * `waiting_for_input` bootstrap runs would lose their worktree at every
 * daemon restart even though `rehydrate` restores `cwd` pointing at it.
 */
export function getResumableBootstrapWorktreePaths(): Set<string> {
  const out = new Set<string>();
  for (const run of runner.listAll()) {
    if (!isActiveRunStatus(run.status)) continue;
    if (run.cwd) out.add(run.cwd);
  }
  return out;
}

/**
 * Start (or resume) a bootstrap run for `request.projectId`. Idempotent per
 * project — a second `start()` call while one is already active re-points
 * the event log and returns the existing run without spawning a new
 * subprocess.
 */
export function startBootstrap(request: StartBootstrapRequest, opts: RunOpts): BootstrapRun {
  return runner.start({ ...request, skillDir: opts.skillDir }, { onEvent: opts.onEvent });
}

/**
 * Forward a user message to a bootstrap run that's `waiting_for_input` or
 * `awaiting_approval` — the discussion step of the plan → discuss → approve
 * → execute lifecycle.
 *
 * @throws {Error} when the run is unknown or not accepting input
 */
export async function sendBootstrapUserMessage(runId: string, message: string, opts: { onEvent(event: BootstrapRunEvent): void }): Promise<void> {
  await runner.sendUserMessage(runId, message, { onEvent: opts.onEvent });
}

/**
 * Apply the user's per-proposal decisions, move the run into `executing`,
 * then dispatch every accepted proposal to its per-entity writer (see
 * {@link dispatchApprovedProposals} / `bootstrap-dispatch.ts`). By the time
 * this function returns, the run has already reached its final `completed`
 * (or `failed`, if dispatch itself crashed) status — dispatch is
 * synchronous, no further run/getRun polling is needed to observe the
 * outcome.
 *
 * @throws {Error} when the run is unknown, has no plan yet, or isn't
 * `awaiting_approval`
 */
export function approveBootstrapPlan(request: ApproveBootstrapPlanRequest, opts: { onEvent(event: BootstrapRunEvent): void }): BootstrapRun {
  const entry = runner.registry().get(request.runId);
  if (!entry) throw new Error(`Bootstrap run not found: ${request.runId}`);
  // Accept both resting statuses whenever a plan exists (defense in depth —
  // B4: a discuss turn that leaves plan.json unchanged no longer demotes
  // `awaiting_approval` to `waiting_for_input` per `onTurnComplete` above,
  // but a run could still be `waiting_for_input` here if it never produced
  // any plan at all, in which case the `!entry.run.plan` check below still
  // rejects it).
  if (entry.run.status !== 'awaiting_approval' && entry.run.status !== 'waiting_for_input') {
    throw new Error(`Bootstrap run ${request.runId} cannot be approved (status=${entry.run.status})`);
  }
  if (!entry.run.plan) {
    throw new Error(`Bootstrap run ${request.runId} has no plan to approve`);
  }

  const decisionsById = new Map(request.decisions.map((d) => [d.id, d]));
  const now = new Date().toISOString();
  entry.run.plan = {
    ...entry.run.plan,
    proposals: entry.run.plan.proposals.map((proposal) => {
      const decision = decisionsById.get(proposal.id);
      if (!decision) {
        // No explicit decision for this proposal. Per the plan-format
        // contract, `pending` means "implicitly included in execution" —
        // matches the UI's default-checked checkbox semantics, where the
        // user only has to act to *exclude* an entity. Promote it to
        // `accepted` so dispatch actually writes it (B7 — previously this
        // silently left it `pending` forever, and dispatch only ever
        // touches `accepted` proposals). Any other status (already
        // `accepted`/`rejected`/`written`/`failed`) passes through as-is.
        return proposal.status === 'pending' ? { ...proposal, status: 'accepted' as const } : proposal;
      }
      return {
        ...proposal,
        status: decision.status,
        content: decision.content ?? proposal.content,
        editedAt: decision.content !== undefined ? now : proposal.editedAt,
      };
    }),
  };

  entry.run.status = 'executing';
  persistRunJson(entry.run.workdir, { ...entry.run, _extras: entry.extras });
  entry.eventLog.emit({ type: 'plan_updated', plan: entry.run.plan });
  entry.eventLog.emit({ type: 'status', status: 'executing' });

  dispatchApprovedProposals(entry);

  return entry.run;
}

/**
 * Cancel an in-flight bootstrap run: `SIGTERM` the child (no-op once resting
 * in `awaiting_approval`/`executing`, where there is none), collapse status
 * to `stopped`, tear down the workdir + worktree. No-op when unknown.
 */
export function stopBootstrap(runId: string): void {
  runner.stop(runId);
}

/**
 * User-acknowledged completion. Tears down the workdir + worktree and
 * removes the entry from the registry. No archived artefact to preserve —
 * the approved plan already lives on `run.plan` (persisted), and step 5's
 * dispatch (once wired) is responsible for whatever it needs to keep.
 */
export function finishBootstrap(runId: string): void {
  runner.finish(runId, { onEvent: () => undefined });
}

/** Look up a bootstrap run by id. Returns `null` when unknown. */
export function getBootstrapRun(runId: string): BootstrapRun | null {
  return runner.getRun(runId);
}

/** Return the buffered stream events for the current (in-flight) turn. */
export function getBootstrapBufferedEvents(runId: string): BootstrapEvent[] {
  return runner.getBufferedEvents(runId);
}

/**
 * True when the tool input targets `plan.json` at the agent's cwd — the
 * live-progress artefact already surfaced via the `plan_updated` event, so
 * re-rendering it as a generic tool call in the chat timeline would be
 * redundant. Mirrors audit-runner's `isAuditProgressPath`.
 */
function isBootstrapPlanPath(input: Record<string, unknown>, agentCwd: string): boolean {
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return false;
  return relative(agentCwd, filePath) === 'plan.json';
}

/**
 * Build the bootstrap-conversation timeline directly from Claude Code's
 * session jsonl. Delegates to the shared `buildChatTimeline` (runner-core) —
 * same universal `user` / `assistant_text` / `tool` kinds `getAuditTimeline`
 * produces, filtering out the agent's `Write` to `plan.json` (already
 * streamed via `plan_updated`). Returns an empty array when the run has no
 * sessionId yet or the file is missing.
 */
export function getBootstrapTimeline(runId: string): BootstrapTimelineEntry[] {
  const entry = runner.registry().get(runId);
  if (!entry) return [];
  const { sessionId, workdir } = entry.run;
  if (!sessionId) return [];

  const sessionBase = entry.run.cwd ?? workdir;
  return buildChatTimeline(sessionBase, sessionId, isBootstrapPlanPath);
}

/**
 * Compute the billed-equivalent + agent-active stats for a bootstrap run.
 * Delegates to `computeSessionUsage` — same algorithm as audit/fix/eval.
 */
export function getBootstrapUsage(runId: string): FixUsage {
  const entry = runner.registry().get(runId);
  if (!entry) return computeSessionUsage('', null);
  const { sessionId, workdir, cwd, startedAt } = entry.run;
  return computeSessionUsage(cwd ?? workdir, sessionId, startedAt);
}
