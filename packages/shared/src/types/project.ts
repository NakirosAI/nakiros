// ---------------------------------------------------------------------------
// Nakiros Agent Team — Project types
// ---------------------------------------------------------------------------

import type { AuditCheckOutcome, AuditManifest } from './audit-checks.js';
import type { FixEvalResult, FixFinding, FixTarget } from './fix-progress.js';

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
  /**
   * Real user activity (`'user'`) vs Nakiros-internal sandbox run
   * (`'synthetic'`: fix-temp / eval iterations / `~/.nakiros/` workdirs).
   * Optional for backward compatibility with callers that build the type
   * outside the conversation-ingest pipeline.
   */
  kind?: 'user' | 'synthetic';
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

/**
 * One assistant turn's cost breakdown — drives the sismograph cost-stacked
 * track. All token fields are raw (input-token-equivalent multipliers are
 * applied to compute `billed` and `cumBilled`).
 */
export interface ConversationCostSample {
  /** Milliseconds since the session's first timestamp. */
  tMs: number;
  /** Position in the conversation (0-1), aligned with other offsetPct fields. */
  offsetPct: number;
  /** Raw `input_tokens` from `usage`. */
  input: number;
  /** Raw `output_tokens` from `usage`. */
  output: number;
  /** Raw `cache_read_input_tokens` from `usage`. */
  cacheRead: number;
  /** Cache write (5min TTL) tokens — `usage.cache_creation.ephemeral_5m_input_tokens`. */
  cache5m: number;
  /** Cache write (1h TTL) tokens — `usage.cache_creation.ephemeral_1h_input_tokens`. */
  cache1h: number;
  /** Billed-equivalent for this turn (×1/×5/×0.1/×1.25/×2). */
  billed: number;
  /** Cumulative billed-equivalent up to and including this turn. */
  cumBilled: number;
  /** Portion of (cache5m + cache1h) attributed as wasted rewrite (turn followed a > TTL pause). */
  wastedRewrite: number;
  /** Tools invoked on this turn (names, in order). */
  toolNames: string[];
}

/** Pause detected when the gap between user reply and last assistant message exceeded the cache TTL. */
export interface ConversationPausePoint {
  /** Milliseconds since the session's first timestamp. */
  tMs: number;
  /** Position in the conversation (0-1). */
  offsetPct: number;
  /** Duration of the gap that caused the cache miss (ms). */
  gapMs: number;
  /** Tokens of cache_creation attributed to this pause (= directly avoidable rewrite cost). */
  wastedTokens: number;
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
  /**
   * Real user activity (`'user'`) vs Nakiros-internal sandbox run
   * (`'synthetic'`). Decorated by the project handler from the conversation-
   * ingest store when available. Optional for backward compatibility with
   * cached analyses produced before the V2 ingest landed.
   */
  kind?: 'user' | 'synthetic';

  // --- Context health ---
  compactions: ConversationCompaction[];
  /**
   * Tokens consumed across all assistant turns (input + output + cache_creation).
   * Cache reads are excluded — they're re-uses of already-paid tokens. Matches
   * the "tokens consumed" counter Claude Code surfaces in the UI.
   */
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
  /**
   * Detected cache TTL mode for this session. Claude Code uses the 1h beta
   * cache by default since 2026-04, but we detect per-session via the
   * `usage.cache_creation` breakdown to stay correct.
   */
  cacheMode: '5m' | '1h';
  /** TTL in minutes corresponding to {@link cacheMode} (5 or 60). */
  cacheTtlMin: number;
  /** User turns where time since last assistant message exceeded the detected TTL. */
  cacheMissTurns: number;
  /** Tokens written to cache on those miss turns — directly the avoidable cost. */
  wastedCacheTokens: number;

  /**
   * Per-turn cost breakdown — drives the sismograph cost track. Empty for
   * sessions with no assistant turns (shouldn't happen for valid JSONLs).
   */
  costSamples: ConversationCostSample[];
  /** Pauses > {@link cacheTtlMin} that forced cache rewrite, with attributed waste. */
  pausePoints: ConversationPausePoint[];

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
// Project aggregate — cheap rollup of all conversation analyses for a
// project, used by the Home screen to paint cards instantly. Persisted under
// `~/.nakiros/cache/aggregates/{projectId}.json` and refreshed in background
// via `project:refreshAggregate`.
// ---------------------------------------------------------------------------

/** Per-project rollup of conversation health metrics. */
export interface ProjectAggregate {
  projectId: string;
  /** Average score across analyses, 0-100. `null` when the project has no conversations yet. */
  score: number | null;
  healthy: number;
  watch: number;
  critical: number;
  totalConvs: number;
  totalTokens: number;
  /** ISO timestamp of the last successful recompute. */
  computedAt: string;
  /** Schema version — bumped when token semantics change. Stale caches are ignored. */
  version?: number;
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
  /** Parent project id when scope is 'project'. */
  projectId?: string;
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
  /**
   * Set when this run was launched from a fix session via
   * `fix:runEvalsInTemp`. Carries the parent fix's `runId` so the frontend
   * can disambiguate fix-temp eval batches (per-fix-session iteration
   * counter starting at 1) from prod eval batches that happen to share
   * the same `iteration` number — without it, both would group under the
   * same `(scope+skill+iteration)` key and dismissed prod batches could
   * shadow live fix-temp batches.
   */
  fixRunId?: string;
  /**
   * Set when this run was launched from a create session via
   * `create:runEvals`. Carries the parent create's `runId` so the
   * frontend recap can locate the draft sandbox (its `workdir`) and
   * read the per-iteration artefacts from there — without it, the
   * recap would resolve `.claude/skills/<name>/` (which doesn't exist
   * yet) and surface 0/0 with no assertions.
   */
  createRunId?: string;
  /** Any error message that occurred. */
  error: string | null;
  /**
   * `true` when the run was rehydrated from disk into `waiting_for_input`
   * after a daemon reboot (instead of having genuinely asked for input).
   * Cleared by a successful turn. Drives the "Reprendre" button in the UI.
   */
  interruptedByReboot?: boolean;
  /**
   * Set when the batch was launched with `skillDirOverride` (typically by
   * `fix:runEvalsInTemp` against the fix's temp workdir). Lets the
   * frontend forward the same override when loading the matrix /
   * iteration artefacts so it reads from the temp dir rather than the
   * real skill dir — otherwise the recap shows 0 assertions because the
   * iteration lives in the temp tree only.
   */
  skillDirOverride?: string | null;
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
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string }
    /**
     * Handler-level failure broadcast by `withBroadcastOnError`. Fires when an
     * IPC handler (e.g. `eval:startRuns`) throws BEFORE the runner can emit a
     * native event, so the originating view receives an out-of-band signal
     * instead of waiting for a turn that will never start. Not persisted to
     * the replay buffer.
     */
    | { type: 'error'; error: string };
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
  /**
   * @deprecated since baseline-per-model refactor (PR2). The daemon now always
   * provides a baseline (cache hit when available, fresh compute on miss), so
   * this flag is ignored. The field is kept temporarily to avoid breaking
   * pre-PR3 callers — to be removed when the frontend migrates.
   * Prefer {@link refreshBaseline} when you need to force a recompute.
   */
  includeBaseline?: boolean;
  /**
   * Force a fresh baseline compute even when one is already cached for
   * `(skillName, evalName, modelFullId, evalFingerprint)`. Used by the
   * "Recalculer la baseline" action in the matrix toolbar. Defaults to
   * `false` — cache is reused on hit.
   */
  refreshBaseline?: boolean;
  /**
   * Run only the baseline (`without_skill`) configuration. Used by the
   * "Recalculer la baseline" kebab action so it doesn't waste tokens on a
   * `with_skill` run the user did not ask for.
   *
   * When `true`:
   *  - `with_skill` is skipped for every selected eval.
   *  - Artefacts go into a temp dir under `~/.nakiros/baselines-tmp/`,
   *    NOT into the iteration workspace — the iteration counter is not
   *    bumped and the matrix doesn't gain a phantom column.
   *  - `benchmark.json` is not written.
   *  - The freshly-computed baselines are upserted to the per-model cache,
   *    then the temp dir is removed.
   *
   * Implies `refreshBaseline: true` semantically — the cache for the
   * selected `(skill, eval, modelFullId, evalFingerprint)` keys is always
   * overwritten when the run succeeds.
   */
  baselineOnly?: boolean;
  /** Max number of runs executing in parallel. Defaults to 4 if omitted. */
  maxConcurrent?: number;
  /**
   * Override the resolved skill directory used as the *execution context*
   * for the eval (the SKILL.md / references / evals.json the agent reads
   * come from here, not the real skill dir). Used by fix runs so the
   * agent evaluates the in-progress modified copy.
   *
   * Important: artefacts (`iteration-N/`) are still written to the real
   * skill workspace (resolved from scope+skillName), so the matrix shows
   * a unified history regardless of the eval source. Use {@link fixRunId}
   * to tag the iteration as `'fix-temp'` and let lifecycle hooks promote
   * (on Finish) or delete (on Reject) the iter accordingly.
   */
  skillDirOverride?: string;
  /**
   * When set, the iteration is tagged `kind: 'fix-temp'` in `benchmark.json`
   * with this `fixRunId` so a later `fix:finish` can promote the latest to
   * `'skill'` and `fix:stopRun` (reject) can delete every iter of the
   * batch from the real workspace. Set by `fix:runEvalsInTemp`.
   */
  fixRunId?: string;
  /**
   * Set when the eval batch was launched from a create session via
   * `create:runEvals`. Carries the parent create's `runId` so the
   * resulting `SkillEvalRun` records can carry it back to the frontend
   * recap (which uses it to read artefacts from the draft sandbox
   * instead of the not-yet-existent prod skill folder). Iterations are
   * NOT tagged `'fix-temp'` — they live with the draft and travel with
   * it on Apply & deploy.
   */
  createRunId?: string;
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
  /**
   * `true` when the last transition into `waiting_for_input` came from a
   * boot-time collapse (subprocess died with the previous daemon), `false`
   * or `undefined` when the agent naturally asked for input. Cleared by a
   * successful turn. Drives the "Reprendre" button in the UI so users can
   * distinguish an interrupted run from a run genuinely awaiting them.
   */
  interruptedByReboot?: boolean;
  /**
   * Static taxonomy emitted by the skill-factory at the start of the run
   * (`outputs/audit-manifest.json`). Drives the live sidebar — sections, check
   * labels, severities, finding codes. `null` until the agent runs the static
   * check script. Persisted so boot rehydration restores the sidebar shape.
   *
   * Optional because `AuditRun` is also reused as the shape for `fix-runner`,
   * which never produces an audit manifest. Audit runs always initialise the
   * field (to `null` initially, then assigned).
   */
  manifest?: AuditManifest | null;
  /**
   * Per-check outcomes appended live to `outputs/audit-progress.jsonl`. Order
   * is the order the runner observed them — the script emits the deterministic
   * checks first, the agent appends the judgement-based ones. Persisted so the
   * sidebar resumes where it left off after a daemon restart.
   *
   * Optional for the same reason as {@link manifest}. Audit runs always
   * initialise to an empty array.
   */
  checkResults?: AuditCheckOutcome[];
  /**
   * Reduced-state fix targets derived from `outputs/fix-targets.jsonl` (the
   * agent's append-only checklist). Only populated for fix runs — never for
   * audit runs, even though they share the {@link AuditRun} shape. Drives
   * the "Targets from audit" sidebar.
   */
  targets?: FixTarget[];
  /**
   * Append-only narrative findings the agent emitted during the fix
   * (`outputs/fix-findings.jsonl`). Only populated for fix runs.
   */
  findings?: FixFinding[];
  /**
   * Set when this run targets a CLAUDE.md file (via `nakiros-claudemd-expert`)
   * instead of a skill. The frontend uses it to swap the run's title /
   * label without changing the kind. Stable across rehydrate.
   */
  claudemdTarget?: ClaudeMdTargetContext;
  /**
   * Set when this run targets a specific `.claude/rules/<ruleName>` file via
   * the bundled `nakiros-rules-expert` instead of a skill. Mutually exclusive
   * with `claudemdTarget`. Stable across rehydrate.
   */
  rulesTarget?: RulesTargetContext;
}

/**
 * Lifecycle status of an `analyze-convo` run. Same shape as audit since the
 * agent is also a single-task runner.
 */
export type AnalyzeConvoRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';

/**
 * Full in-memory state of a deep conversation-analysis run. Mirrors `AuditRun`
 * but targets a Claude Code session (projectId + sessionId) and writes its
 * markdown report into the run workdir + the cache used by `loadDeepAnalysis`.
 */
export interface AnalyzeConvoRun {
  runId: string;
  projectId: string;
  sessionId: string;
  status: AnalyzeConvoRunStatus;
  sessionClaudeId: string | null;
  workdir: string;
  /** `claude --model` id pinned at start (haiku for small convs, sonnet for big). */
  model: string;
  /** Estimated input tokens of the synthesised prompt — used for cost transparency. */
  estimatedInputTokens: number;
  /** Path to the persisted markdown report inside `~/.nakiros/analyses/`. */
  reportPath: string | null;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  interruptedByReboot?: boolean;
}

/** Event broadcast on `analyzeConvo:event` while an analyze-convo run is alive. */
export interface AnalyzeConvoRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: AnalyzeConvoRunStatus }
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string; reportPath?: string }
    | { type: 'error'; error: string };
}

/** Request payload for `analyzeConvo:start`. */
export interface StartAnalyzeConvoRequest {
  projectId: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Classify-convo runner — V1.1 friction classifier (Haiku 4.5) emits a
// structured JSON digest instead of a markdown report. Reuses the same runner
// pattern as analyze-convo so multiple sessions can be classified in parallel,
// runs survive reboots, and the UI gets live token/tool/text streaming.
// ---------------------------------------------------------------------------

export type ClassifyConvoRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';

/** Full in-memory state of a friction-classification run. */
export interface ClassifyConvoRun {
  runId: string;
  projectId: string;
  /**
   * Claude Code session id of the **sub-agent run** spawned by `claude --print`
   * to produce the digest. Inherited from `BaseRun.sessionId` and overwritten
   * by runner-core's `onSession` handler the moment the sub-run emits its
   * first event. **Never use this to identify the source conversation** —
   * use {@link sourceSessionId}.
   */
  sessionId: string;
  /**
   * Claude Code session id of the **source conversation** being classified
   * (passed in `StartClassifyConvoRequest.sessionId`). Stable across the run's
   * lifetime; the digest is persisted under this id so the UI can look it up
   * from the conversation drawer.
   */
  sourceSessionId: string;
  status: ClassifyConvoRunStatus;
  sessionClaudeId: string | null;
  workdir: string;
  /** `claude --model` id pinned at start (haiku for ≤170k digest, sonnet above). */
  model: string;
  /** Estimated input tokens of the digest+prompt — used for cost transparency. */
  estimatedInputTokens: number;
  /** Path of the persisted digest JSON under `~/.nakiros/ingest/projects/<encoded>/digests/`. */
  digestPath: string | null;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  interruptedByReboot?: boolean;
}

/** Event broadcast on `classifyConvo:event` while a classify-convo run is alive. */
export interface ClassifyConvoRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: ClassifyConvoRunStatus }
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string; digestPath?: string }
    | { type: 'error'; error: string };
}

/** Request payload for `classifyConvo:start`. */
export interface StartClassifyConvoRequest {
  projectId: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Claudemd target — when an audit / fix / create run targets a CLAUDE.md file
// instead of a skill, this carries the resolution context so the runner's
// buildFirstPrompt can invoke `nakiros-claudemd-expert` with the correct file
// path. The kind stays `audit` / `fix` / `create` so the entire RunScreen UI
// (AuditCompletedReport, sidebar, header progress) reuses unchanged.
// ---------------------------------------------------------------------------

/**
 * Mode of a claudemd run. The bundled `nakiros-claudemd-expert` skill exposes
 * four entry-point commands; only the first three are launched as Nakiros
 * runs (improve is interactive and stays inside an existing run).
 */
export type ClaudeMdRunMode = 'audit' | 'fix' | 'create';

/**
 * Optional target descriptor for an audit / fix / create run that operates on
 * the project-root `./CLAUDE.md` via the bundled `nakiros-claudemd-expert`.
 * When present, the runner's buildFirstPrompt switches to a
 * `/nakiros-claudemd-expert` invocation; when absent, the runner targets a
 * skill via `nakiros-skill-factory`.
 *
 * Only the root CLAUDE.md is supported — multi-scope variants
 * (`.claude/CLAUDE.md`, `CLAUDE.local.md`) have been removed.
 */
export interface ClaudeMdTargetContext {
  projectId: string;
  projectPath: string;
  /** Run mode — drives the slash-command suffix. */
  mode: ClaudeMdRunMode;
}

/** Event broadcast on `audit:event` while an audit run is alive. */
export interface AuditRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: AuditRunStatus }
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'done'; exitCode: number; error?: string; reportPath?: string }
    /**
     * Static check taxonomy. Emitted once, the first time the runner observes
     * `outputs/audit-manifest.json`. Drives the sidebar skeleton (sections,
     * check labels, severities). Frontend caches it on the run state.
     */
    | { type: 'manifest'; manifest: AuditManifest }
    /**
     * One check decided. Emitted per new line observed in
     * `outputs/audit-progress.jsonl`. Frontend appends to `run.checkResults`
     * and updates the per-section progress + findings live panel.
     */
    | { type: 'check_result'; outcome: AuditCheckOutcome }
    /**
     * Reduced-state target snapshot for fix runs. Emitted whenever
     * `outputs/fix-targets.jsonl` grows; carries the full effective list so
     * the consumer doesn't need to replay individual entries to compute
     * todo/done state. Frontend assigns to `run.targets`.
     */
    | { type: 'fix_targets'; targets: FixTarget[] }
    /**
     * One newly observed finding from `outputs/fix-findings.jsonl`. Frontend
     * appends to `run.findings`.
     */
    | { type: 'fix_finding'; finding: FixFinding }
    /**
     * One eval result emitted when a `runFixEvalsInTemp` batch completes.
     * Frontend appends a card to the fix timeline. Persisted in
     * `outputs/fix-eval-results.jsonl` for replay; broadcast lazily by the
     * fix-runner watcher (`scheduleFixEvalBatchWatcher`).
     */
    | { type: 'fix_eval_result'; result: FixEvalResult }
    /**
     * Handler-level failure broadcast by `withBroadcastOnError`. See
     * `EvalRunEvent`'s `error` variant for the contract — same semantics
     * applied to audit / fix / create.
     */
    | { type: 'error'; error: string };
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
  /**
   * Optional descriptor for runs that target a CLAUDE.md file via the
   * bundled `nakiros-claudemd-expert`. When present, the runner switches its
   * slash-command and skips the skill-bound archive step. The standard
   * `scope` / `skillName` still resolve to the bundled expert directory.
   */
  claudemdTarget?: ClaudeMdTargetContext;
  /**
   * Optional descriptor for runs that target a specific `.claude/rules/<ruleName>`
   * file via the bundled `nakiros-rules-expert`. When present, the runner switches
   * its slash-command and archives the report under the rules history. Mutually
   * exclusive with `claudemdTarget`.
   */
  rulesTarget?: RulesTargetContext;
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
 * Per-kind raw token totals + the billed-equivalent and agent-active timer
 * surfaced by the fix screen header. Computed on demand from the fix run's
 * Claude Code session JSONL (the source of truth — the runner's own token
 * tally drops cache_read / cache_creation today).
 *
 * `billedEquivalent` weighs each kind by its Anthropic pricing multiplier
 * relative to base input (see `docs/decisions/token-accounting.md`):
 *   input ×1, output ×5, cache_read ×0.1, cache_creation_5m ×1.25,
 *   cache_creation_1h ×2. Surfaced as a single number in the "Tokens" stat
 *   so users see a coherent cost signal regardless of cache hit rate.
 *
 * `agentActiveMs` is the sum of (assistant_ts − prev_user_ts) intervals
 * over the session — i.e. wall-clock time the model actually spent
 * generating, excluding user-input pauses. Frozen when the run is
 * `waiting_for_input` or terminal.
 */
export interface FixUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  /** Sum of all four token kinds without weighting — the raw context size. */
  rawTotal: number;
  /** Pricing-weighted sum surfaced in the header "Tokens" stat. */
  billedEquivalent: number;
  /** Agent-active wall-clock time over the run, excluding user-input pauses. */
  agentActiveMs: number;
  /** Timestamp of the last assistant turn parsed from the JSONL, or null when none. */
  lastAssistantTurnAt: string | null;
  /** Timestamp of the last user message parsed from the JSONL, or null when none. */
  lastUserMessageAt: string | null;
  /** Number of completed assistant turns observed in the session. */
  assistantTurns: number;
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

// ---------------------------------------------------------------------------
// Rules run target — when an audit / fix run targets a specific rule file
// under .claude/rules/ via the bundled `nakiros-rules-expert`.
// ---------------------------------------------------------------------------

/**
 * Mode of a rules run. The bundled `nakiros-rules-expert` skill exposes
 * three entry-point commands.
 */
export type RulesRunMode = 'audit' | 'fix' | 'create';

/**
 * Optional target descriptor for an audit / fix / create run that operates on
 * a specific `.claude/rules/<ruleName>` file via the bundled
 * `nakiros-rules-expert`. When present on `StartAuditRequest`, the runner's
 * `buildFirstPrompt` switches to a `/nakiros-rules-expert` invocation; when
 * absent, the runner targets a skill via `nakiros-skill-factory`.
 *
 * The `ruleName` is the **relative path from `.claude/rules/`** (e.g.
 * `"i18n.md"` or `"frontend/styling.md"`). Sub-folder notation is supported.
 */
export interface RulesTargetContext {
  projectId: string;
  projectPath: string;
  /** Filename of the rule under .claude/rules/ (e.g. "i18n.md", "frontend/styling.md"). */
  ruleName: string;
  mode: RulesRunMode;
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
