/**
 * Project `.claude` Bootstrap — shared types.
 *
 * Implements the plan-validation step of
 * `docs/redesign/features/project-bootstrap.md`. The bootstrap runner (v1)
 * analyses a project with an empty/minimal `.claude/` across three crossed
 * sources — the codebase, the existing `DotClaudeSnapshot`, and optional
 * conversation friction digests — and proposes one coherent
 * {@link ProjectBootstrapPlan} covering every entity kind at once (CLAUDE.md,
 * path-scoped rules, subagents, hooks, permissions, mcp, output-styles).
 *
 * The user reviews/edits/approves the plan entity by entity — same
 * philosophy as the reco-cards flow (see `recommendation.ts`) — and can
 * discuss it with the agent before approving (reuses the
 * `waiting_for_input` + `sendUserMessage` interaction model of the audit/fix
 * runners). Only once approved does execution happen, and execution goes
 * through the existing per-entity writers/experts — no new write path.
 */

import type { RecommendationArtifactType } from './recommendation.js';
import type { AuditRunTurn } from './project.js';

// ─── Entity proposal ────────────────────────────────────────────────────────

/**
 * Lifecycle of a single entity proposal inside a {@link ProjectBootstrapPlan}.
 * `pending` is the default right after the analyse step. It means
 * "implicitly included in execution" **literally**: `approveBootstrapPlan`
 * promotes every proposal still `pending` at approval time (i.e. any
 * proposal absent from {@link ApproveBootstrapPlanRequest.decisions}) to
 * `accepted` before dispatch — matching the validation UI's default-checked
 * checkbox semantics, where the user only has to act to *exclude* an entity,
 * not to include it. The user can still flip a proposal to `accepted`
 * (explicitly) or `rejected` during the validation step; only `rejected`
 * proposals are skipped by dispatch. `written` / `failed` are set once the
 * execute step has run — a plan is not reused across bootstrap runs, so this
 * field doubles as both "user decision" and "execution outcome" without a
 * separate result type.
 */
export type BootstrapProposalStatus = 'pending' | 'accepted' | 'rejected' | 'written' | 'failed';

/**
 * One atomic proposal covering a single `.claude/` entity — mirrors
 * {@link RecoCard} but produced up-front by the bootstrap analyse step
 * (whole-project pass) instead of per friction pattern. Reuses
 * {@link RecommendationArtifactType} for the entity taxonomy instead of
 * redefining it.
 */
export interface BootstrapEntityProposal {
  /** Stable id, e.g. `rules:frontend/styling.md` or `claudemd:root` — unique within the plan. */
  id: string;
  artifactType: RecommendationArtifactType;
  /**
   * Identifier of the target artefact (filename, slug, or `'new'` for a
   * not-yet-named create). Same convention as {@link RecoCard.target} /
   * `ApplyRecommendationContext.target`.
   */
  target: string;
  /** Short human title, e.g. "Add `frontend/styling.md` rule". */
  title: string;
  /**
   * Why this entity is proposed — references the codebase/snapshot/friction
   * evidence that motivated it. Rendered under the title in the validation UI.
   */
  rationale: string;
  /**
   * Proposed full content for the entity (markdown body for CLAUDE.md/rules/
   * subagents/output-styles; serialised JSON block for hooks/permissions/mcp).
   * User-editable inline before approval — same flow as {@link RecoCard.brief}.
   */
  content: string;
  status: BootstrapProposalStatus;
  /** ISO-8601 timestamp set when the user edited `content` inline. */
  editedAt?: string;
  /** Absolute path written, set once `status` becomes `'written'`. */
  writtenPath?: string;
  /** Human-readable error, set once `status` becomes `'failed'`. */
  error?: string;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/**
 * Global configuration plan produced by the bootstrap analyse step — one
 * coherent proposal covering every `.claude/` entity so cross-entity
 * coherence (CLAUDE.md content vs path-scoped rules, subagents matching the
 * repo layout, permissions matching the commands actually run, …) is decided
 * in a single pass instead of entity by entity. See "Decisions" §2 in the
 * feature doc. Persisted as part of the {@link BootstrapRun} so it survives
 * daemon restarts and reopening the screen.
 */
export interface ProjectBootstrapPlan {
  projectId: string;
  projectPath: string;
  /** ISO-8601 timestamp of the last analyse/discuss turn that updated this plan. */
  generatedAt: string;
  /** Free-form narrative summary — cross-entity coherence rationale, rendered above the per-entity list. */
  summary: string;
  /**
   * `true` when conversation friction digests contributed to this plan
   * (feature doc decision §4 — a bonus source, never required). `false` when
   * the plan was built from the codebase + `DotClaudeSnapshot` alone.
   */
  usedFrictionDigests: boolean;
  /** One entry per proposed entity. Empty array is valid — nothing to propose on an already well-configured project. */
  proposals: BootstrapEntityProposal[];
}

// ─── Runner status & run ─────────────────────────────────────────────────────

/**
 * Lifecycle status of a {@link BootstrapRun}. Extends the familiar
 * `AuditRunStatus` shape (`starting`/`running`/`waiting_for_input`/terminal)
 * with two bootstrap-specific phases: `awaiting_approval` (the plan is ready
 * and the user is checking/unchecking/editing entities — no agent turn is
 * active) and `executing` (writes are being applied through the per-entity
 * writers, after the user approved).
 */
export type BootstrapRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'stopped';

/**
 * Full in-memory state of a project bootstrap run — modeled on `AuditRun`
 * (single skill-bound conversational agent) but targeting the whole project
 * and carrying the evolving {@link ProjectBootstrapPlan} instead of an audit
 * report. `turns` covers both the analyse step and the discuss step (feature
 * doc decision §3) — one conversation, replayed as a single timeline.
 */
export interface BootstrapRun {
  runId: string;
  projectId: string;
  projectPath: string;
  status: BootstrapRunStatus;
  sessionId: string | null;
  workdir: string;
  /**
   * Optional override of the `cwd` passed to the Claude CLI subprocess —
   * set to a git worktree of `projectPath` when one could be created, so
   * the agent gets real codebase access while `workdir` stays the Nakiros
   * artefact root (`dot-claude-snapshot.json`, `friction-digests.json`,
   * the agent-written `plan.json`, `run.json`, `events.jsonl`). `undefined`
   * when the project isn't a git repo — the agent then reads the codebase
   * directly from `projectPath` via absolute paths. Daemon-internal, not
   * sent to the frontend (same convention as `AuditRun.cwd`).
   */
  cwd?: string;
  /**
   * The plan as of the last analyse/discuss turn, or the last approval/
   * execution update. `null` until the first analyse turn produces a draft.
   */
  plan: ProjectBootstrapPlan | null;
  /**
   * Number of proposals in `plan`, populated on list payloads
   * (`bootstrap:listAll` / `bootstrap:listActive`) where `plan` and `turns`
   * are stripped to keep the 2s dock poll light. Full runs (`getRun`,
   * events) carry the real `plan` instead.
   */
  proposalCount?: number;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Same boot-collapse-vs-natural-pause distinction as `AuditRun.interruptedByReboot`. */
  interruptedByReboot?: boolean;
}

/** Request payload for `bootstrap:start`. */
export interface StartBootstrapRequest {
  projectId: string;
  projectPath: string;
}

/**
 * Request payload for `bootstrap:approvePlan` — the user's final per-entity
 * decisions before execution begins. Proposals **not** listed here are NOT
 * left unchanged: any proposal still `pending` is promoted to `accepted`
 * (see {@link BootstrapProposalStatus}) before dispatch — only an explicit
 * `rejected` decision excludes a proposal from execution. Proposals already
 * `accepted` from a prior partial approval, or already `rejected`, and not
 * listed here, keep that status.
 */
export interface ApproveBootstrapPlanRequest {
  runId: string;
  decisions: Array<{
    /** Matches {@link BootstrapEntityProposal.id}. */
    id: string;
    status: 'accepted' | 'rejected';
    /** Inline edit to `content`, when the user retouched the proposal before approving. */
    content?: string;
  }>;
}

/** Event broadcast on `bootstrap:event` while a bootstrap run is alive. */
export interface BootstrapRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: BootstrapRunStatus }
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    /**
     * The plan changed — either the first analyse draft, a discuss-step
     * revision, or an execution-step update to per-proposal `status`.
     */
    | { type: 'plan_updated'; plan: ProjectBootstrapPlan }
    | { type: 'done'; exitCode: number; error?: string }
    | { type: 'error'; error: string };
}
