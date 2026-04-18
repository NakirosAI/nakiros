// ---------------------------------------------------------------------------
// Nakiros Agent Team — Project types
// ---------------------------------------------------------------------------

export type ProviderType = 'claude' | 'gemini' | 'cursor' | 'codex';

export type ProjectStatus = 'active' | 'inactive' | 'dismissed';

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

export interface ConversationMessage {
  uuid: string;
  parentUuid: string | null;
  type: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  isSidechain: boolean;
  toolUse?: { name: string; input: unknown }[];
}

export interface SkillFileEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children?: SkillFileEntry[];
  sizeBytes?: number;
}

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
}

// ---------------------------------------------------------------------------
// Eval types
// ---------------------------------------------------------------------------

export type SkillEvalAssertionType = 'script' | 'llm' | 'manual';

export interface SkillEvalAssertion {
  type?: SkillEvalAssertionType;
  text: string;
  passed: boolean;
  evidence: string;
}

export interface SkillEvalTiming {
  totalTokens: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

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

export interface SkillEvalGrading {
  evalName: string;
  withSkill: SkillEvalGradingRun | null;
  withoutSkill: SkillEvalGradingRun | null;
  deltaPassRate: number | null;
  deltaTokens: number | null;
  deltaDurationMs: number | null;
  humanFeedback: string | null;
}

export interface SkillEvalRunSummary {
  passRate: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  tokens: number;
  durationMs: number;
}

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

export interface SkillEvalAssertionDefinition {
  type: SkillEvalAssertionType;
  text: string;
  script?: string;
}

export type SkillEvalMode = 'autonomous' | 'interactive';

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

export type EvalRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'grading'
  | 'completed'
  | 'failed'
  | 'stopped';

export type EvalRunConfig = 'with_skill' | 'without_skill';

export interface EvalRunTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: { name: string; display: string }[];
}

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
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
  /** Absolute path to the eval working directory (where outputs/ lives). */
  workdir: string;
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
  /** Token/duration stats captured from Claude's result event. */
  tokensUsed: number;
  durationMs: number;
  /** Wall-clock boundaries. */
  startedAt: string;
  finishedAt: string | null;
  /** Any error message that occurred. */
  error: string | null;
}

export interface EvalRunOutputEntry {
  /** Path relative to the run's outputs/ directory. */
  relativePath: string;
  sizeBytes: number;
  /** ISO timestamp of the file's mtime. */
  modifiedAt: string;
}

export interface EvalRunProgress {
  runId: string;
  status: EvalRunStatus;
  tokensUsed: number;
  elapsedMs: number;
  latestText?: string;
  latestTool?: string;
}

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
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
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
}

export interface StartEvalRunResponse {
  iteration: number;
  runIds: string[];
}

// ---------------------------------------------------------------------------
// Audit run (static review of a skill via /nakiros-skill-factory audit)
// ---------------------------------------------------------------------------

export type AuditRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface AuditRunTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: { name: string; display: string }[];
}

export interface AuditRun {
  runId: string;
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
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

export interface StartAuditRequest {
  scope: 'project' | 'nakiros-bundled' | 'claude-global';
  projectId?: string;
  skillName: string;
}

// ---------------------------------------------------------------------------
// Fix iteration benchmarks — compare the real skill's latest iteration to
// the fix workdir's latest iteration.
// ---------------------------------------------------------------------------

export interface FixBenchmarkSnapshot {
  iteration: number;
  timestamp: string | null;
  withSkill: SkillEvalRunSummary;
  withoutSkill: SkillEvalRunSummary | null;
}

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

export interface AuditHistoryEntry {
  /** Filename like `audit-2026-04-17T10-00-00.md`. */
  fileName: string;
  /** Absolute path. */
  path: string;
  /** ISO timestamp parsed from the filename (or fs mtime as fallback). */
  timestamp: string;
  sizeBytes: number;
}

export interface ProjectStats {
  totalSessions: number;
  totalMessages: number;
  toolUsageFrequency: Record<string, number>;
  averageSessionLength: number;
  lastActiveAt: string | null;
  topSkills: string[];
}

export interface GlobalStats {
  totalProjects: number;
  totalSessions: number;
  mostActiveProjects: { id: string; name: string; sessionCount: number }[];
  providerBreakdown: Record<ProviderType, number>;
}

export interface SkillRecommendation {
  type: 'missing-skill' | 'friction-point' | 'optimization';
  title: string;
  description: string;
  evidence: string;
  suggestedAction: string;
  projectId: string;
}

export interface ScanProgress {
  provider: ProviderType;
  current: number;
  total: number;
  projectName: string | null;
}
