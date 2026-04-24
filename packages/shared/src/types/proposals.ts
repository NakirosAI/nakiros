// ---------------------------------------------------------------------------
// Friction → Skill Proposals
//
// The proposal engine closes the loop between the deep-analyzer (detects
// frictions in past Claude Code conversations) and the eval pipeline
// (validates skill quality). When N recurring frictions cluster around the
// same pain point, the engine generates a proposal — either a brand-new
// skill or a patch to an existing one — and lets the user validate it via
// the existing multi-model eval flow.
//
// Persistence layout (local-first, under ~/.nakiros/):
//   frictions/<YYYY-MM>.jsonl         # append-only per-month buckets
//   frictions/archive/                # frictions older than the active window
//   proposals/<proposalId>.json       # one file per proposal, full snapshot
//   proposals/rejected.json           # cluster signatures the user rejected
// ---------------------------------------------------------------------------

/**
 * Raw friction as emitted by the `nakiros-conversation-analyst` skill in the
 * `nakiros-json` tail of its report. This is the *input* contract of the
 * proposal engine — kept minimal, no embedding, no skill detection yet.
 * See `bundled-skills/nakiros-conversation-analyst/references/machine-output.md`
 * for the authoritative schema.
 */
export interface RawFriction {
  approximateTurn: number;
  timestampIso: string;
  description: string;
  category?: string;
  rawExcerpt: string;
}

export interface AnalyzerStructuredOutput {
  schemaVersion: 1;
  frictions: RawFriction[];
}

/**
 * A single friction point enriched with everything the proposal engine needs:
 * a natural-language summary (embedded for clustering), the skills that were
 * in play when the friction happened, and the raw excerpt for traceability.
 *
 * One EnrichedFriction = one pain moment in one conversation.
 */
export interface EnrichedFriction {
  id: string;
  /**
   * Nakiros project the conversation belongs to. Frictions cluster and
   * propose within a single project — a "use Cognito flow" proposal from
   * project A has no business polluting project B's insights.
   */
  projectId: string;
  conversationId: string;
  /** Unix ms — when the friction occurred inside the conversation. */
  timestamp: number;
  /** LLM-generated summary (Haiku, via deep-analyzer). Input to embedding. */
  description: string;
  /** Optional coarse tag from the analyzer ("tool-loop", "wrong-file", …). */
  category?: string;
  /** First ~500 chars of transcript around the friction, for UI traceability. */
  rawExcerpt: string;
  /** Skill names detected as active when the friction happened. See SkillDetection. */
  skillsDetected: string[];
  /**
   * Embedding vector (all-MiniLM-L6-v2, 384 dims). Kept with the friction so
   * clustering doesn't have to re-embed on every pass. Stored as a plain
   * number[] to keep the JSONL file portable.
   */
  embedding: number[];
}

/**
 * Result of skill-detection on a conversation slice. Produced by the
 * classifier, attached to every EnrichedFriction.
 *
 * Detection strategy (in order):
 *  1. Slash commands: <command-name> tags in assistant/user turns.
 *  2. Read tool calls on **\/SKILL.md or **\/skills/<name>/...
 *  3. Fallback: empty list → proposal will default to type 'new'.
 */
export interface SkillDetection {
  /** Skill names found via <command-name> tags. */
  viaSlashCommand: string[];
  /** Skill names found via Read tool calls on SKILL.md paths. */
  viaReadSkillMd: string[];
  /** De-duplicated union of both sources. */
  all: string[];
}

/**
 * An in-memory group of frictions that share a pain point. Recomputed on
 * every analyzer pass — never persisted on its own (persistence lives in
 * the underlying frictions and the derived proposals).
 */
export interface FrictionCluster {
  /** Stable id derived from the cluster centroid (so rejects can be matched back). */
  id: string;
  frictionIds: string[];
  /** occurrences × recency_weight × density_weight. */
  score: number;
  firstSeen: number;
  lastSeen: number;
  /** Skill name that appears in > 50% of the cluster's frictions, else undefined. */
  dominantSkill?: string;
}

/**
 * A single eval case handed to skill-factory. Mirrors the minimal shape the
 * skill-factory prompt expects — kept local to this module so we don't
 * couple the shared package to internal runner types.
 */
export interface ProposalEvalCase {
  name: string;
  /** User prompt the eval harness will replay. */
  prompt: string;
  /** Optional expected outcome description (graded by the LLM grader). */
  expectation?: string;
  /** When true, this case was seeded from a real friction (vs LLM-generated). */
  fromFriction?: boolean;
}

export type ProposalStatus =
  | 'draft'
  | 'eval_running'
  | 'eval_done'
  | 'accepted'
  | 'rejected';

export type ProposalType = 'new' | 'patch';

/**
 * A generated proposal — either a new skill or a patch to an existing one.
 * Status transitions: draft → eval_running → eval_done → (accepted|rejected).
 * Rejected proposals are kept (so we never regenerate the same cluster).
 */
export interface Proposal {
  id: string;
  /** Project this proposal applies to — always matches the frictions it came from. */
  projectId: string;
  type: ProposalType;
  /** Defined iff type === 'patch'. Name of the skill being patched. */
  targetSkill?: string;
  /** Cluster signature the proposal was generated from. */
  clusterId: string;
  frictionIds: string[];
  /** Cluster score at generation time — frozen for traceability. */
  score: number;
  draft: {
    /** SKILL.md contents (full new skill, or full replacement for a patch). */
    content: string;
    /**
     * For `type === 'patch'`: snapshot of the existing SKILL.md at the time
     * the proposal was generated. Lets the UI show a side-by-side diff that
     * stays stable even if the underlying skill changes later. Omitted for
     * new-skill proposals.
     */
    originalContent?: string;
    evalCases: ProposalEvalCase[];
  };
  status: ProposalStatus;
  /** Opaque reference to the eval run(s) triggered by the user. */
  evalResults?: unknown;
  /** Unix ms. */
  createdAt: number;
  /** Unix ms. */
  updatedAt: number;
}

// ─── IPC request/response shapes ────────────────────────────────────────────

export interface ListProposalsRequest {
  /** Required: proposals are always project-scoped. */
  projectId: string;
  /** Optional status filter — omit to list all. */
  status?: ProposalStatus;
}

export interface ListProposalsResponse {
  proposals: Proposal[];
}

export interface GetProposalRequest {
  id: string;
}

export interface AcceptProposalRequest {
  id: string;
}

export interface RejectProposalRequest {
  id: string;
  /** Optional free-text reason kept for future tuning of the proposal engine. */
  reason?: string;
}

export interface RunProposalEvalRequest {
  id: string;
  /** Models to run against. Defaults to the user's configured comparison set. */
  models?: string[];
}

/** Event broadcast whenever a new proposal lands in the store. */
export interface ProposalsNewEvent {
  proposal: Proposal;
}

/** Event broadcast by the deep-analyzer once a conversation's structured JSON is parsed. */
export interface ConversationAnalyzedEvent {
  sessionId: string;
  projectId: string;
  /** Absolute path to the conversation JSONL (so the engine can re-read messages for classifier). */
  providerProjectDir: string;
  /** The structured frictions the analyzer extracted. May be empty. */
  frictions: RawFriction[];
  /** ISO timestamp of the analysis. */
  generatedAt: string;
}
