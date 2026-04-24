// ---------------------------------------------------------------------------
// Nakiros Agent Team — Project types
// ---------------------------------------------------------------------------

/** Supported AI coding agents that Nakiros can scan for projects and skills. */
export type ProviderType = 'claude' | 'gemini' | 'cursor' | 'codex';

/** Lifecycle status of a project tracked by Nakiros. */
export type ProjectStatus = 'active' | 'inactive' | 'dismissed';

/** Persisted project record: scanned from a provider project directory + user metadata. */
export interface Project {
  id: string;
  name: string;
  projectPath: string;
  provider: ProviderType;
  providerProjectDir: string;
  lastActivityAt: string | null;
  sessionCount: number;
  skillCount: number;
  status: ProjectStatus;
  lastScannedAt: string;
  createdAt: string;
}

/**
 * Project freshly detected by the scanner, not yet persisted. The `status`
 * field is still populated so the UI can filter already-dismissed projects
 * from a re-scan.
 */
export interface DetectedProject {
  id: string;
  name: string;
  projectPath: string;
  provider: ProviderType;
  providerProjectDir: string;
  lastActivityAt: string | null;
  sessionCount: number;
  skillCount: number;
  status: ProjectStatus;
}

/** Compact metadata extracted from a single Claude Code JSONL conversation. */
export interface ProjectConversation {
  sessionId: string;
  projectId: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  toolsUsed: string[];
  gitBranch: string | null;
  cwd: string;
  claudeVersion: string | null;
  summary: string;
}

/** Normalized message extracted from a Claude Code JSONL entry. */
export interface ConversationMessage {
  uuid: string;
  parentUuid: string | null;
  type: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  isSidechain: boolean;
  toolUse?: { name: string; input: unknown }[];
}

// ---------------------------------------------------------------------------
// Conversation analysis — deterministic (no LLM) signals extracted from JSONL.
// Powers the health-oriented ConversationsView (score, badges, diagnostic).
// ---------------------------------------------------------------------------

/** Health zone displayed in the UI for a conversation's overall score. */
export type ConversationHealthZone = 'healthy' | 'watch' | 'degraded';

/** A single compaction event (auto or manual) detected in the JSONL stream. */
export interface ConversationCompaction {
  /** Wall-clock timestamp of the compact_boundary entry. */
  timestamp: string;
  /** 'auto' (hit ctx limit) or 'manual' (/compact). */
  trigger: 'auto' | 'manual' | 'unknown';
  /** Tokens of context before compaction — signals how deep the session had grown. */
  preTokens: number;
  /** Tokens retained after compaction. */
  postTokens: number;
  /** Position in the conversation (0-1), useful for the timeline. */
  offsetPct: number;
}

/** User-message moment flagged as friction (correction / frustration / abort). */
export interface ConversationFrictionPoint {
  /** Position in the conversation (0-1) — tied to lost-in-the-middle zone. */
  offsetPct: number;
  timestamp: string;
  /** First ~200 chars of the user message that triggered the friction flag. */
  snippet: string;
  /** Which keyword/pattern matched ("stop", "revert", "pas ça"…). */
  matchedPattern: string;
  /** Tool name the assistant used just before this friction, if any. */
  precedingTool: string | null;
}

/** Per-tool usage stats aggregated across a conversation. */
export interface ConversationToolStats {
  /** Total tool_use invocations for this tool. */
  count: number;
  /** tool_result entries with is_error: true. */
  errorCount: number;
}

/** File touched repeatedly by Edit / Write / NotebookEdit — candidate for rework pattern. */
export interface ConversationHotFile {
  /** Absolute path (or relative if that's what the tool received). */
  path: string;
  /** How many times the file was edited via Edit / Write / NotebookEdit. */
  editCount: number;
}

/** Category a {@link ConversationTip} belongs to — drives grouping in the UI. */
export type ConversationTipCategory =
  | 'context'
  | 'cache'
  | 'friction'
  | 'tools'
  | 'workflow'
  | 'skills';

/** Severity of a {@link ConversationTip}, used for sorting and badge colour. */
export type ConversationTipSeverity = 'info' | 'warning' | 'critical';

/** One actionable tip surfaced by the rule-based conversation analyzer. */
export interface ConversationTip {
  /** Stable id mapping to i18n keys `tips.<id>.title` and `tips.<id>.body`. */
  id: string;
  category: ConversationTipCategory;
  severity: ConversationTipSeverity;
  /** Values for i18n interpolation (counts, token sizes, file names). */
  data: Record<string, string | number>;
}

/**
 * Full deterministic analysis of a single conversation: metadata, context
 * health, cache efficiency, friction, tool usage, composite score and tips.
 * Consumed by the ConversationsView table and the diagnostic panel.
 */
export interface ConversationAnalysis {
  sessionId: string;
  projectId: string;

  // --- Raw metadata ---
  startedAt: string;
  lastMessageAt: string;
  durationMs: number;
  messageCount: number;
  summary: string;
  gitBranch: string | null;

  // --- Context health ---
  compactions: ConversationCompaction[];
  /** Sum of input_tokens + output_tokens + cache_creation + cache_read across all assistant turns. */
  totalTokens: number;
  /** Peak in-context tokens on a single turn (input + cache_read + cache_creation). */
  maxContextTokens: number;
  /** Effective context window in tokens — auto-detected (200k default, 1M when usage suggests it). */
  contextWindow: number;
  healthZone: ConversationHealthZone;
  /** Sampled context size per assistant turn — used by the UI to draw the growth curve. */
  contextSamples: Array<{ offsetPct: number; tokens: number }>;

  // --- Cache efficiency ---
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** User turns where time since last assistant message exceeded 5 min (default TTL). */
  cacheMissTurns: number;
  /** Tokens written to cache on those miss turns — directly the avoidable cost. */
  wastedCacheTokens: number;

  // --- Friction ---
  frictionPoints: ConversationFrictionPoint[];

  // --- Tool use ---
  toolStats: Record<string, ConversationToolStats>;
  toolErrorCount: number;

  // --- Repetition ---
  hotFiles: ConversationHotFile[];

  // --- Sidechains & commands ---
  sidechainCount: number;
  slashCommands: string[];

  // --- Composite score & human-readable verdict ---
  /**
   * 0–100 health score — higher = healthier.
   * Starts at 100 and gets penalized by compactions, friction, tool errors,
   * context bloat, and cache waste. Low scores bubble to the top in the UI.
   */
  score: number;
  /** One-line root-cause hypothesis, generated by rules. */
  diagnostic: string;
  /** Actionable suggestions for improving future conversations, ranked by severity. */
  tips: ConversationTip[];
}

// ---------------------------------------------------------------------------
// Deep (LLM-powered) conversation analysis — stage 2 narrative report.
// Runs on demand via the nakiros-conversation-analyst skill, routed to Haiku
// for small sessions and Sonnet (1M context) for big ones.
// ---------------------------------------------------------------------------

/** LLM-generated narrative report produced by the deep-analysis skill. */
export interface ConversationDeepAnalysis {
  sessionId: string;
  /** Which Claude model produced the report. */
  model: 'haiku' | 'sonnet';
  /** Approximate input tokens sent to the model — helps the UI show cost. */
  inputTokens: number;
  /** Markdown report emitted by the skill. */
  report: string;
  generatedAt: string;
}

/** Directory entry inside a skill folder — file or nested directory with children. */
export interface SkillFileEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children?: SkillFileEntry[];
  sizeBytes?: number;
}

/**
 * Unified scope discriminator for every skill-bound operation
 * (list, read, eval, audit, fix, create). Keep in sync with
 * `resolveEvalSkillDir` + `resolveSkillDir` on the daemon side.
 *
 * - `project`       → <project>/.claude/skills/<name>
 * - `nakiros-bundled` → ~/.nakiros/skills/<name>
 * - `claude-global` → ~/.claude/skills/<name>
 * - `plugin`        → ~/.claude/plugins/marketplaces/<marketplaceName>/plugins/<pluginName>/skills/<name>
 */
export type SkillScope = 'project' | 'nakiros-bundled' | 'claude-global' | 'plugin';

/** Complete skill record: content, directory tree, eval suite, audit count. */
export interface Skill {
  name: string;
  projectId: string;
  skillPath: string;
  content: string;
  hasEvals: boolean;
  hasReferences: boolean;
  hasTemplates: boolean;
  files: SkillFileEntry[];
  evals: SkillEvalSuite | null;
  /** Number of archived audit reports in {skill}/audits/. */
  auditCount: number;
  /** Only set for `scope: 'plugin'` — the plugin directory name. */
  pluginName?: string;
  /** Only set for `scope: 'plugin'` — the marketplace directory name (parent of the plugin). */
  marketplaceName?: string;
}

// ---------------------------------------------------------------------------
// Eval types
// ---------------------------------------------------------------------------

/** Type of an assertion in an eval definition — deterministic script, LLM judge, or manual review. */
export type SkillEvalAssertionType = 'script' | 'llm' | 'manual';

/** Single assertion result produced by the grader for one eval run. */
export interface SkillEvalAssertion {
  type?: SkillEvalAssertionType;
  text: string;
  passed: boolean;
  evidence: string;
}

/** Token/duration stats captured from a single eval run's `timing.json`. */
export interface SkillEvalTiming {
  totalTokens: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

/** Grading payload for one eval run (with_skill or without_skill baseline). */
export interface SkillEvalGradingRun {
  config: 'with_skill' | 'without_skill';
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  assertions: SkillEvalAssertion[];
  notes: string;
  timing: SkillEvalTiming | null;
  graderModel: string | null;
}

/** Paired grading for one eval at one iteration — with_skill + baseline + deltas. */
export interface SkillEvalGrading {
  evalName: string;
  withSkill: SkillEvalGradingRun | null;
  withoutSkill: SkillEvalGradingRun | null;
  deltaPassRate: number | null;
  deltaTokens: number | null;
  deltaDurationMs: number | null;
  humanFeedback: string | null;
}

/** Compact per-run summary used inside {@link SkillEvalIteration}. */
export interface SkillEvalRunSummary {
  passRate: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  tokens: number;
  durationMs: number;
}

/** One iteration (a full eval round) for a skill — aggregates every eval + baseline. */
export interface SkillEvalIteration {
  number: number;
  timestamp: string | null;
  withSkill: SkillEvalRunSummary;
  withoutSkill: SkillEvalRunSummary | null;
  delta: {
    passRate: number | null;
    tokens: number | null;
    durationMs: number | null;
  };
  deltaVsPreviousIteration: number | null;
  gradings: SkillEvalGrading[];
}

/** Assertion declaration from the eval's definition file (script/llm/manual + text). */
export interface SkillEvalAssertionDefinition {
  type: SkillEvalAssertionType;
  text: string;
  script?: string;
}

/** Execution mode: `autonomous` (single --print turn) vs `interactive` (multi-turn via --resume). */
export type SkillEvalMode = 'autonomous' | 'interactive';

/** Complete eval definition as declared in the skill's evals folder. */
export interface SkillEvalDefinition {
  id: number;
  name: string;
  prompt: string;
  expectedOutput: string;
  /** 'autonomous' (default) = single --print turn. 'interactive' = multi-turn via --resume. */
  mode?: SkillEvalMode;
  /** Expected output files (relative to outputs/). Used to detect auto-termination in interactive mode. */
  outputFiles?: string[];
  assertions: SkillEvalAssertionDefinition[] | string[];
}

/** Full eval suite for a skill: static definitions + history of iteration results. */
export interface SkillEvalSuite {
  skillName: string;
  definitions: SkillEvalDefinition[];
  iterations: SkillEvalIteration[];
  latestPassRate: number | null;
  latestDelta: number | null;
}

// ---------------------------------------------------------------------------
// Eval Run execution (live state)
// ---------------------------------------------------------------------------

/** Lifecycle status of a single eval run. */
export type EvalRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'grading'
  | 'completed'
  | 'failed'
  | 'stopped';

/** Config flavour of an eval run — `with_skill` loads the skill, `without_skill` is the baseline. */
export type EvalRunConfig = 'with_skill' | 'without_skill';

/** Ordered block inside an eval turn — text or tool invocation, in stream order. */
export type EvalRunTurnBlock =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string };

/** One turn (user or assistant message) in an eval run. */
export interface EvalRunTurn {
  role: 'user' | 'assistant';
  /** Joined text of all text-blocks. Kept for backward compat + grading which aggregates text. */
  content: string;
  timestamp: string;
  /** Legacy flat list of tools used in this turn. Replaced by `blocks` for ordered rendering. */
  tools?: { name: string; display: string }[];
  /**
   * Ordered blocks as they arrived in the claude stream. Text and tool blocks
   * are interleaved in the order the agent emitted them, so the UI can render
   * a chat-style thread instead of "text then tools grouped at the bottom".
   * Absent on runs written before this field existed.
   */
  blocks?: EvalRunTurnBlock[];
}

/** Full in-memory state of a single eval run — status, turns, tokens, artefact paths. */
export interface SkillEvalRun {
  /** Unique id for this specific run process (local in-memory). */
  runId: string;
  /** The skill being evaluated. */
  skillName: string;
  /** The eval test case name. */
  evalName: string;
  /** Iteration number in the skill workspace. */
  iteration: number;
  /** with_skill or without_skill. */
  config: EvalRunConfig;
  /** Current status. */
  status: EvalRunStatus;
  /** The Claude CLI session id for --resume on interactive runs. */
  sessionId: string | null;
  /** Scope: whether launched from a project or from bundled Nakiros skills. */
  scope: SkillScope;
  /** Parent plugin name when scope is 'plugin'. */
  pluginName?: string;
  /** Parent marketplace name when scope is 'plugin'. */
  marketplaceName?: string;
  /** Absolute path to the eval artefact directory (grading.json, outputs/, diff.patch, run.json). */
  workdir: string;
  /**
   * Where the claude subprocess actually runs. Either a git worktree of the
   * project root (when the skill lives inside a git repo — the safe sandbox
   * mode for code-modifying skills) or the same path as `workdir` when no
   * git repo was found (fallback to the legacy in-place behaviour).
   *
   * Null on runs created before this field existed.
   */
  executionDir?: string | null;
  /** True when `executionDir` is a git worktree (diff.patch is meaningful for this run). */
  usesSandbox?: boolean;
  /** Prompt text the agent is executing. */
  prompt: string;
  /** Eval execution mode. */
  mode: SkillEvalMode;
  /** Expected output files (relative to outputs/). */
  outputFiles: string[];
  /** HOME directory used for baseline isolation (kept alive between turns for interactive mode). */
  isolatedHome: string | null;
  /** Conversation turns (user + agent). */
  turns: EvalRunTurn[];
  /**
   * Claude model id passed to the CLI for this run (e.g. `claude-opus-4-7`).
   * Null on runs created before the selector existed — the eval matrix will
   * display an "unknown model" badge for those legacy iterations.
   */
  model?: string | null;
  /** Token/duration stats captured from Claude's result event. */
  tokensUsed: number;
  durationMs: number;
  /** Wall-clock boundaries. */
  startedAt: string;
  finishedAt: string | null;
  /** Any error message that occurred. */
  error: string | null;
}

/** Output file metadata surfaced in the eval UI (size + mtime, no content). */
export interface EvalRunOutputEntry {
  /** Path relative to the run's outputs/ directory. */
  relativePath: string;
  sizeBytes: number;
  /** ISO timestamp of the file's mtime. */
  modifiedAt: string;
}

/** Progress snapshot emitted while an eval run is active. */
export interface EvalRunProgress {
  runId: string;
  status: EvalRunStatus;
  tokensUsed: number;
  elapsedMs: number;
  latestText?: string;
  latestTool?: string;
}

/** Event broadcast on `eval:event` while an eval run is alive. */
export interface EvalRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: EvalRunStatus }
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string; display: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string };
}

/**
 * Request to start a suite of eval runs.
 * If evalNames is empty/undefined, runs all evals defined for the skill.
 */
export interface StartEvalRunRequest {
  scope: SkillScope;
  /** Parent plugin name when scope is 'plugin'. */
  pluginName?: string;
  /** Parent marketplace name when scope is 'plugin'. */
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  evalNames?: string[];
  includeBaseline?: boolean;
  /** Max number of runs executing in parallel. Defaults to 4 if omitted. */
  maxConcurrent?: number;
  /**
   * Override the resolved skill directory. Used by fix runs to evaluate the
   * modified copy in the temp workdir BEFORE syncing to the real skill.
   * When set, the eval runs write results into this directory's evals/workspace/.
   */
  skillDirOverride?: string;
  /**
   * Claude model id to pass as `--model` to the CLI subprocess (e.g.
   * `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`). When omitted
   * the CLI uses its own default — callers should pass the model explicitly
   * so the iteration can be tagged with it in the eval matrix.
   */
  model?: string;
}

/** Response from `eval:startRuns` — the iteration index + the per-run runIds. */
export interface StartEvalRunResponse {
  iteration: number;
  runIds: string[];
}

// ---------------------------------------------------------------------------
// Audit run (static review of a skill via /nakiros-skill-factory audit)
// ---------------------------------------------------------------------------

/** Lifecycle status of an audit run. */
export type AuditRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';

/** One turn (user or assistant) inside an audit run conversation. */
export interface AuditRunTurn {
  role: 'user' | 'assistant';
  /** Joined text-block content. Kept for backward compat + grading. */
  content: string;
  timestamp: string;
  /** Legacy flat list — replaced by `blocks` for ordered rendering. */
  tools?: { name: string; display: string }[];
  /**
   * Ordered text/tool blocks as they arrived in the claude stream. Same shape
   * as `EvalRunTurnBlock` — UIs can render a chat-style thread where tool
   * calls appear at the exact spot the agent emitted them. Absent on runs
   * written before this field existed.
   */
  blocks?: EvalRunTurnBlock[];
}

/** Full in-memory state of an audit run — mirror of {@link SkillEvalRun} for the audit flow. */
export interface AuditRun {
  runId: string;
  scope: SkillScope;
  /** Parent plugin name when scope is 'plugin'. */
  pluginName?: string;
  /** Parent marketplace name when scope is 'plugin'. */
  marketplaceName?: string;
  projectId?: string;
  /** The skill being audited. */
  skillName: string;
  status: AuditRunStatus;
  sessionId: string | null;
  workdir: string;
  /** Final report path inside {skill}/audits/, set once the run completes successfully. */
  reportPath: string | null;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

/** Event broadcast on `audit:event` while an audit run is alive. */
export interface AuditRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: AuditRunStatus }
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string; display: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string; reportPath?: string };
}

/** Request payload for the `audit:start` IPC channel. */
export interface StartAuditRequest {
  scope: SkillScope;
  /** Parent plugin name when scope is 'plugin'. */
  pluginName?: string;
  /** Parent marketplace name when scope is 'plugin'. */
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
}

// ---------------------------------------------------------------------------
// Fix iteration benchmarks — compare the real skill's latest iteration to
// the fix workdir's latest iteration.
// ---------------------------------------------------------------------------

/** Single benchmark snapshot: one iteration's pass/tokens for with_skill + baseline. */
export interface FixBenchmarkSnapshot {
  iteration: number;
  timestamp: string | null;
  withSkill: SkillEvalRunSummary;
  withoutSkill: SkillEvalRunSummary | null;
}

/** Paired benchmarks used by the fix UI to compare real vs temp skill performance. */
export interface FixBenchmarks {
  real: FixBenchmarkSnapshot | null;
  temp: FixBenchmarkSnapshot | null;
}

/**
 * File entry inside a fix/create run's temp workdir. Shown in the UI so the user
 * can preview what will be written before clicking "Sync to skill" / "Create skill".
 */
export interface SkillAgentTempFileEntry {
  /** Path relative to the temp workdir root. */
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

/** Union value returned by `skillAgent:readTempFile` — text blob or image data URL. */
export type SkillAgentTempFileContent =
  | { kind: 'text'; content: string }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'binary'; sizeBytes: number }
  | { kind: 'missing' };

/** Historical audit report entry listed by `audit:listHistory`. */
export interface AuditHistoryEntry {
  /** Filename like `audit-2026-04-17T10-00-00.md`. */
  fileName: string;
  /** Absolute path. */
  path: string;
  /** ISO timestamp parsed from the filename (or fs mtime as fallback). */
  timestamp: string;
  sizeBytes: number;
}

/** Per-project stats tile: total sessions, messages, tool frequency, top skills. */
export interface ProjectStats {
  totalSessions: number;
  totalMessages: number;
  toolUsageFrequency: Record<string, number>;
  averageSessionLength: number;
  lastActiveAt: string | null;
  topSkills: string[];
}

/** Aggregate stats across every tracked project, used for the Home dashboard. */
export interface GlobalStats {
  totalProjects: number;
  totalSessions: number;
  mostActiveProjects: { id: string; name: string; sessionCount: number }[];
  providerBreakdown: Record<ProviderType, number>;
}

/** Recommendation surfaced by the proposal engine: missing skill, friction point, or optimization. */
export interface SkillRecommendation {
  type: 'missing-skill' | 'friction-point' | 'optimization';
  title: string;
  description: string;
  evidence: string;
  suggestedAction: string;
  projectId: string;
}

/** Progress event broadcast on `project:scanProgress` while the scanner walks provider dirs. */
export interface ScanProgress {
  provider: ProviderType;
  current: number;
  total: number;
  projectName: string | null;
}
