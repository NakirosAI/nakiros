/**
 * Friction-pattern recommendation types — shared between the daemon and the
 * frontend. Implements `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
 */

// ─── Zone reference ─────────────────────────────────────────────────────────

/** Reference to a single friction zone inside a conversation. */
export interface RecommendationZoneRef {
  convoId: string;
  zoneId: string;
}

// ─── Pattern ─────────────────────────────────────────────────────────────────

/**
 * Per-project cluster of similar friction zones. Computed by
 * `services/recommendation-cluster.ts` from cached `ConversationAnalysis`
 * entries. No LLM involved at this stage — the LLM is invoked later by the
 * analyser run referenced in {@link RecommendationPattern.analysis}.
 */
export interface RecommendationPattern {
  /** Stable hash of `zoneRefs` sorted lexicographically (`convoId:zoneId`). */
  id: string;
  projectId: string;
  /** Every friction zone that contributed to this cluster. */
  zoneRefs: RecommendationZoneRef[];
  signature: {
    /** Top 8 tokens by frequency across the cluster (lowercased, stop-words removed). */
    topTokens: string[];
    /** Union of `agentContext.filesTouched` across zones (deduped, in first-seen order). */
    filesTouched: string[];
    /** Union of `signalKinds` across zones. */
    signalKinds: Array<'S4' | 'S5' | 'S6'>;
    /** Earliest zone `startTimestamp` in the cluster (ISO-8601). */
    firstSeen: string;
    /** Latest zone `endTimestamp` in the cluster (ISO-8601). */
    lastSeen: string;
  };
  /** Same as `zoneRefs.length`, denormalised for sorting/UI. */
  zoneCount: number;
  /**
   * Max `severity` across zones, bumped to `'high'` when `zoneCount >= 4`.
   * Drives visual priority in the pattern list.
   */
  severity: 'medium' | 'high';
  /** Track the LLM analyser run that produced the cards (if any). */
  analysis: {
    status: 'idle' | 'running' | 'done' | 'failed';
    /** `runId` of the {@link RecommendationAnalyzeRun} that is/was producing cards. */
    runId?: string;
    /** Count of valid cards persisted under `<patternId>/recos/`. */
    recoCount?: number;
    /** ISO-8601 timestamp of the last completed analyser run. */
    lastAnalyzedAt?: string;
  };
}

// ─── Reco card ───────────────────────────────────────────────────────────────

/** Type of `.claude/` artefact a recommendation targets. */
export type RecommendationArtifactType =
  | 'rules'
  | 'skill'
  | 'claudemd'
  | 'subagent'
  | 'hook'
  | 'permission'
  | 'mcp'
  | 'output-style';

export type RecommendationTargetDomain = 'techne' | 'hestia';

/** Explicit cross-domain route prepared by Argos for user review. */
export interface RecommendationReviewRoute {
  sourceDomain: 'argos';
  targetDomain: RecommendationTargetDomain;
  artifactType: RecommendationArtifactType;
  action: 'fix' | 'create';
  target: string;
  reviewRequired: true;
}

/**
 * One atomic recommendation card produced by an analyser run.
 * Persisted as a markdown file with YAML frontmatter under
 * `~/.nakiros/<projectId>/recommendations/<patternId>/recos/<recId>.md`.
 */
export interface RecoCard {
  /** Kebab-case id parsed from the markdown frontmatter `recId` field. */
  recId: string;
  patternId: string;
  action: 'fix' | 'create';
  artifactType: RecommendationArtifactType;
  /** Computed by the bridge when the card crosses the IPC boundary. */
  route?: RecommendationReviewRoute;
  /**
   * Identifier of the existing artefact when `action === 'fix'`; `'new'` when
   * `action === 'create'`.
   */
  target: string;
  /** Short human title parsed from frontmatter. */
  title: string;
  /** Raw markdown body (everything after the frontmatter). */
  body: string;
  /**
   * Extracted "## Brief" section. This is what gets sent as the first user
   * message to the downstream `edit:* | create:* | fix:*` runner. The user
   * may edit this inline before applying.
   */
  brief: string;
  evidence: {
    zoneRefs: RecommendationZoneRef[];
    /** Files touched by the friction zones that motivated this card. */
    files: string[];
  };
  status: 'pending' | 'applied' | 'dismissed';
  /** Set when `status === 'applied'` — the `runId` of the spawned downstream run. */
  appliedRunId?: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp set when the user edited the brief inline before applying. */
  editedAt?: string;
}

// ─── IPC payloads ────────────────────────────────────────────────────────────

/** Request payload for `recommendations:analyzePattern`. */
export interface StartRecommendationAnalyzeRequest {
  projectId: string;
  patternId: string;
}

/**
 * Response shape from `recommendations:applyReco`.
 * On success the downstream runner has been spawned and `runId` identifies it.
 */
export type ApplyRecoResponse =
  | {
      ok: true;
      runId: string;
      runKind: 'fix' | 'create' | 'edit';
      targetDomain: RecommendationTargetDomain;
    }
  | {
      ok: false;
      error: 'target-missing' | 'unknown-artifact-type' | 'reco-not-found' | 'review-required';
    };

export type GetRecommendationReviewRouteResponse =
  | { ok: true; route: RecommendationReviewRoute }
  | { ok: false; error: 'reco-not-found' | 'unknown-artifact-type' };

// ─── Runner status & run ─────────────────────────────────────────────────────

/**
 * Lifecycle states of a {@link RecommendationAnalyzeRun}.
 * Mirrors `ClassifyConvoRunStatus` — same set of values, separate type so
 * that future specialisation (e.g. a `'parsing'` state) does not pollute the
 * shared union.
 */
export type RecommendationAnalyzeRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';

/**
 * Single-turn analyser run that sends a cluster digest to the LLM and
 * persists the resulting {@link RecoCard}s.
 *
 * Mirrors `ClassifyConvoRun` — the source pattern is tracked via
 * {@link RecommendationAnalyzeRun.sourcePatternId} since
 * {@link RecommendationAnalyzeRun.sessionId} is overwritten by runner-core
 * with the spawned Claude Code session id the moment the first stream event
 * arrives. Same pitfall documented in
 * `feedback_runner_core_session_id_overwrite.md`.
 */
export interface RecommendationAnalyzeRun {
  runId: string;
  projectId: string;
  /** Pattern this run is analysing — stable, never overwritten by runner-core. */
  sourcePatternId: string;
  /**
   * Claude Code session id assigned to this run by runner-core. Overwritten
   * on first stream event — do **not** use to identify the source pattern.
   * Use {@link sourcePatternId} instead.
   */
  sessionId: string;
  status: RecommendationAnalyzeRunStatus;
  /** Claude Code's own session identifier (from the `session` stream event). */
  sessionClaudeId: string | null;
  /** Absolute path of the temporary working directory for this run. */
  workdir: string;
  /** `claude --model` value used for this run. */
  model: 'sonnet' | 'opus';
  /** Count of {@link RecoCard}s successfully parsed and persisted. */
  recoCount: number;
  /**
   * Conversation turns logged by runner-core. Single-turn runner — will always
   * contain exactly one `user` turn (the first prompt) and one `assistant` turn
   * once the run completes.
   */
  turns: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    tools?: { name: string; display: string }[];
    blocks?: Array<{ type: 'text'; text: string } | { type: 'tool'; name: string; display: string }>;
  }>;
  /** Cumulative output tokens reported by runner-core across all streaming events. */
  tokensUsed: number;
  /** Total wall-clock milliseconds the Claude Code subprocess was active. */
  durationMs: number;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** ISO-8601 finish timestamp — `null` while the run is active. */
  finishedAt: string | null;
  /** Human-readable error message when `status === 'failed'`. */
  error: string | null;
  /** Set to `true` when the daemon restarted while this run was active. */
  interruptedByReboot?: boolean;
}

// ─── Run events ──────────────────────────────────────────────────────────────

/**
 * Event broadcast on `recommendations:event` while an analyser run is alive.
 * Consumed by the frontend to drive live progress feedback.
 */
export interface RecommendationAnalyzeRunEvent {
  runId: string;
  event:
    | { type: 'stream'; data: unknown }
    | { type: 'status'; status: RecommendationAnalyzeRunStatus }
    | { type: 'done'; recoCount: number }
    | { type: 'error'; error: string };
}
