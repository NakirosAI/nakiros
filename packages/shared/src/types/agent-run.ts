import type { ClaudeMdRunMode, RulesRunMode, SubagentsRunMode, HooksRunMode, PermissionsRunMode, PermissionsExpertScope, McpRunMode, OutputStylesRunMode, SkillScope } from './project.js';

export type { ClaudeMdRunMode } from './project.js';
export type { RulesRunMode } from './project.js';
export type { SubagentsRunMode } from './project.js';
export type { HooksRunMode } from './project.js';
export type { PermissionsRunMode } from './project.js';
export type { PermissionsExpertScope } from './project.js';
export type { McpRunMode } from './project.js';
export type { OutputStylesRunMode } from './project.js';

/**
 * The discriminator of an agent run. Each kind has its own backing runner on
 * the daemon (audit / eval / fix / create) and its own native landing screen
 * on the frontend. New kinds (e.g. `analyze-convo`) extend this union without
 * changing the surrounding contract.
 */
export type AgentRunKind = 'audit' | 'eval' | 'fix' | 'create' | 'edit' | 'analyze-convo' | 'classify-convo' | 'recommendation-analyze';

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
 * A conversation-bound target — used by the `analyze-convo` kind. Carries
 * the project id + Claude Code session id so the runner can locate the JSONL
 * and the frontend can deep-link back to the diagnostic view.
 */
export interface ConversationRunTarget {
  type: 'conversation';
  projectId: string;
  sessionId: string;
}

/**
 * A CLAUDE.md-bound target — used by the `claudemd` kind. Targets the
 * project-root `./CLAUDE.md` exclusively (no multi-scope support).
 */
export interface ClaudeMdRunTarget {
  type: 'claudemd';
  projectId: string;
  projectPath: string;
  mode: ClaudeMdRunMode;
}

/**
 * A rules-bound target — used when an audit / fix / create run targets a
 * specific `.claude/rules/<ruleName>` file via `nakiros-rules-expert`.
 * The `ruleName` is the relative path from `.claude/rules/` (e.g.
 * `"i18n.md"` or `"frontend/styling.md"`).
 */
export interface RulesRunTarget {
  type: 'rules';
  projectId: string;
  projectPath: string;
  /** ".claude/rules/<ruleName>" — relative path from .claude/rules/ */
  ruleName: string;
  mode: RulesRunMode;
}

/**
 * A subagents-bound target — used when an audit / fix / create run targets a
 * specific `.claude/agents/<subagentName>` file via `nakiros-subagents-expert`.
 * The `subagentName` is the relative filename from `.claude/agents/` (e.g.
 * `"backend.md"` or `"team/reviewer.md"`).
 */
export interface SubagentsRunTarget {
  type: 'subagents';
  projectId: string;
  projectPath: string;
  /** ".claude/agents/<subagentName>" — relative filename from .claude/agents/ */
  subagentName: string;
  mode: SubagentsRunMode;
}

/**
 * A hooks-bound target — used when an audit / fix / create run targets the
 * `.claude/settings.json` hooks block via `nakiros-hooks-expert`. Singleton
 * per project — no `name` field (unlike rules or subagents).
 */
export interface HooksRunTarget {
  type: 'hooks';
  projectId: string;
  projectPath: string;
  mode: HooksRunMode;
}

/**
 * A permissions-bound target — used when an audit / fix / create run targets
 * the `.claude/settings.json` or `.claude/settings.local.json` permissions block
 * via `nakiros-permissions-expert`. No `name` field — scoped by `scope` only.
 * Two runs with different scopes may coexist on the same project.
 */
export interface PermissionsRunTarget {
  type: 'permissions';
  projectId: string;
  projectPath: string;
  /** Which settings file is targeted (`'project'` or `'local'`). */
  scope: PermissionsExpertScope;
  mode: PermissionsRunMode;
}

/**
 * A mcp-bound target — used when an audit / fix / create run targets the
 * project-root `.mcp.json` file via `nakiros-mcp-expert`. Singleton per
 * project — no `name` field (unlike rules or subagents).
 */
export interface McpRunTarget {
  type: 'mcp';
  projectId: string;
  projectPath: string;
  mode: McpRunMode;
}

/**
 * An output-styles-bound target — used when an audit / fix / create run
 * targets a specific `.claude/output-styles/<styleName>` file via
 * `nakiros-output-styles-expert`. Collection — one entry per style file,
 * same as rules/subagents.
 */
export interface OutputStylesRunTarget {
  type: 'output-styles';
  projectId: string;
  projectPath: string;
  /** Relative filename from .claude/output-styles/ (e.g. "minimal.md", "subdir/explanatory.md"). */
  styleName: string;
  mode: OutputStylesRunMode;
}

/**
 * Discriminated union of every supported target shape. New target kinds
 * extend this union when their corresponding agent-run kind ships.
 */
export type AgentRunTarget = SkillRunTarget | ConversationRunTarget | ClaudeMdRunTarget | RulesRunTarget | SubagentsRunTarget | HooksRunTarget | PermissionsRunTarget | McpRunTarget | OutputStylesRunTarget;

/**
 * Kind-specific opaque payload riding alongside an `AgentRun`. The store
 * never inspects it; only the matching `kind`'s adapter and its consumer
 * (the focus handler in `useSkillsViewState`) read the relevant variant.
 *
 * - `eval` carries the batch of run ids that share the same skill+iteration,
 *   so clicking the entry can open `EvalRunsView` with the full batch.
 */
export type AgentRunMeta =
  | {
      kind: 'eval';
      runIds: string[];
      iteration: number;
      /**
       * Set when this eval batch was launched from a create run via
       * `create:runEvals`. The recap uses it to read iteration artefacts
       * from the draft sandbox (the create run's workdir) instead of the
       * not-yet-existent `.claude/skills/<name>/` folder.
       */
      createRunId?: string;
    };

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
  /** Kind-specific data — opaque to the store, see {@link AgentRunMeta}. */
  meta?: AgentRunMeta;
}
