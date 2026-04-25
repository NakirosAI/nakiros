import type { SkillScope } from './project.js';

/**
 * The discriminator of an agent run. Each kind has its own backing runner on
 * the daemon (audit / eval / fix / create) and its own native landing screen
 * on the frontend. New kinds (e.g. `analyze-convo`) extend this union without
 * changing the surrounding contract.
 */
export type AgentRunKind = 'audit' | 'eval' | 'fix' | 'create';

/**
 * Lifecycle status surfaced to the UI. Mapped from each runner's native
 * status by the corresponding adapter — keeping a single set of strings means
 * the topbar / runs center / status badges share one rendering pipeline.
 */
export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'done'
  | 'failed'
  | 'cancelled';

/**
 * Capabilities the UI must expose for this run. All three default to `true` —
 * a runner declares `false` only when the operation is genuinely impossible
 * (e.g. a passive read-only audit that cannot accept user messages mid-run).
 */
export interface AgentRunCapabilities {
  canSendMessage: boolean;
  canApprove: boolean;
  canStop: boolean;
}

/**
 * A skill-bound target — common shape for audit / eval / fix / create. Carries
 * enough identity to resolve the underlying skill directory and to deep-link
 * the user back to the right native screen.
 */
export interface SkillRunTarget {
  type: 'skill';
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
}

/**
 * Discriminated union of every supported target shape. New target kinds
 * (e.g. `{ type: 'conversation'; conversationId: string; … }`) extend this
 * union when their corresponding agent-run kind ships.
 */
export type AgentRunTarget = SkillRunTarget;

/**
 * The unified run primitive surfaced to the runs center, the activity feed,
 * and any "is something running on this target?" check across the UI. Each
 * runner emits its native record; an adapter translates it into this shape.
 *
 * `events` is intentionally omitted from this type — the activity-feed
 * channel will carry events when it lands; v1 only consumes the metadata.
 */
export interface AgentRun {
  id: string;
  kind: AgentRunKind;
  /** Display title — adapter sets it (e.g. "Audit · my-skill"). */
  title: string;
  target: AgentRunTarget;
  status: AgentRunStatus;
  startedAt: string;
  endedAt?: string;
  capabilities: AgentRunCapabilities;
  /** Cumulative tokens used by the underlying claude process, when known. */
  tokensUsed?: number;
}
