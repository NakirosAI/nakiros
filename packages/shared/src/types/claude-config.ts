/**
 * Snapshot of a project's `.claude/` configuration produced by
 * `claudeConfig:scan`. Read-only V1 surface — covers the 9 categories shown in
 * the Configuration tab (CLAUDE.md, settings, rules, skills gateway, commands,
 * output styles, subagents, MCP, hooks). No edits, no MCP probing.
 */
export interface ClaudeConfigSnapshot {
  summary: ClaudeConfigSummary;
  claudeMd: ClaudeMdInfo;
  settings: SettingsInfo;
  rules: RulesInfo;
  skills: SkillsGatewayInfo;
  commands: CommandsInfo;
  outputStyles: OutputStylesInfo;
  agents: AgentsInfo;
  mcp: McpInfo;
  hooks: HooksInfo;
}

export interface ClaudeConfigSummary {
  /** Number of categories with at least one entry (0..9). */
  completeness: number;
  totalCategories: number;
  /** Approx tokens injected at every session start (CLAUDE.md + active rules + active output style). */
  totalTokensInjected: number;
  /** Absolute path to the project's `.claude/` directory (may not exist). */
  path: string;
  /** ISO timestamp of when this snapshot was produced. */
  scannedAt: string;
}

// ── CLAUDE.md ──────────────────────────────────────────────────────────────
export interface ClaudeMdInfo {
  present: boolean;
  /** Absolute path. Always set, even when `present` is false. */
  path: string;
  lines: number;
  chars: number;
  /** Approx tokens (chars / 4). */
  tokens: number;
  /** Top-level `#` headings in document order. */
  headings: string[];
  /** ISO timestamp of last modification, or null when missing. */
  lastModified: string | null;
}

// ── settings.json + .local ─────────────────────────────────────────────────
export interface SettingsInfo {
  /** True when at least one of project/local exists. */
  present: boolean;
  project: SettingsFile;
  local: SettingsFile;
  /** Resolved view: which source wins per top-level concern. */
  effective: EffectiveSettings;
}

export interface SettingsFile {
  present: boolean;
  /** Absolute path. Always set, even when `present` is false. */
  path: string;
  lastModified: string | null;
  /** Parsed JSON content; null when file is missing or invalid. */
  data: SettingsData | null;
  /** Set when JSON parsing failed (file exists but is malformed). */
  parseError?: string;
}

/**
 * Raw shape of `settings.json` — kept loose because Claude Code accepts
 * additional keys we don't model here. Only the keys Nakiros surfaces in V1
 * are typed.
 */
export interface SettingsData {
  model?: string;
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  env?: Record<string, string>;
  hooks?: SettingsHooks;
  outputStyle?: string;
  [key: string]: unknown;
}

/** `hooks` block of `settings.json`, keyed by lifecycle event. */
export type SettingsHooks = Partial<Record<HookEventName, SettingsHookEntry[]>>;

export interface SettingsHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
  /** Some configs use a flat `command` field instead of `hooks[].command`. */
  command?: string;
}

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd';

/** Resolved (effective) view of project + local settings. */
export interface EffectiveSettings {
  model: ResolvedField<string | null>;
  permissions: {
    allowCount: ResolvedField<number>;
    denyCount: ResolvedField<number>;
    askCount: ResolvedField<number>;
  };
  envCount: ResolvedField<number>;
  hookCount: ResolvedField<number>;
  outputStyle: ResolvedField<string | null>;
  /** Top-level keys that `settings.local.json` overrides on `settings.json`. */
  localOverrides: string[];
}

export interface ResolvedField<T> {
  value: T;
  source: 'project' | 'local' | 'none';
}

// ── rules ──────────────────────────────────────────────────────────────────
export interface RulesInfo {
  present: boolean;
  count: number;
  /** Sum of `tokens` across all rule files. */
  totalTokens: number;
  items: RuleEntry[];
}

export interface RuleEntry {
  name: string;
  /** Path relative to the project root. */
  relativePath: string;
  /** Globs from the rule's `paths:` frontmatter; empty array when always-on. */
  paths: string[];
  tokens: number;
  /** First ~140 chars of body content (after frontmatter), trimmed. */
  summary: string;
  lastModified: string | null;
}

// ── skills (gateway only) ──────────────────────────────────────────────────
export interface SkillsGatewayInfo {
  present: boolean;
  count: number;
}

// ── commands ───────────────────────────────────────────────────────────────
export interface CommandsInfo {
  present: boolean;
  count: number;
  items: CommandEntry[];
}

export interface CommandEntry {
  name: string;
  relativePath: string;
  description: string | null;
  /** Value of the `argument-hint:` frontmatter, e.g. `<issue-number>`. */
  argumentHint: string | null;
  tokens: number;
  lastModified: string | null;
}

// ── output styles ──────────────────────────────────────────────────────────
export interface OutputStylesInfo {
  present: boolean;
  count: number;
  items: OutputStyleEntry[];
}

export interface OutputStyleEntry {
  name: string;
  relativePath: string;
  description: string | null;
  keepCodingInstructions: boolean;
  tokens: number;
  lastModified: string | null;
}

// ── subagents ──────────────────────────────────────────────────────────────
export interface AgentsInfo {
  present: boolean;
  count: number;
  items: AgentEntry[];
}

export interface AgentEntry {
  name: string;
  relativePath: string;
  description: string | null;
  /** Comma-separated tool names from the `tools:` frontmatter. */
  tools: string[];
  model: string | null;
  tokens: number;
  lastModified: string | null;
}

// ── MCP servers (.mcp.json) ────────────────────────────────────────────────
export interface McpInfo {
  present: boolean;
  count: number;
  /** Absolute path to `.mcp.json` at the project root. */
  path: string;
  lastModified: string | null;
  items: McpServerEntry[];
  /** Set when `.mcp.json` exists but is malformed. */
  parseError?: string;
}

export interface McpServerEntry {
  name: string;
  /** `'stdio' | 'sse' | 'http' | null` — derived from the server config shape. */
  transport: 'stdio' | 'sse' | 'http' | null;
  command: string | null;
  args: string[];
  /** Names of env vars referenced (values redacted — V1 doesn't probe). */
  envKeys: string[];
  /** SSE/HTTP URL when applicable. */
  url: string | null;
}

// ── hooks (derived from settings) ──────────────────────────────────────────
export interface HooksInfo {
  /** True when at least one event has at least one hook attached. */
  present: boolean;
  /** Total hook entries across all events. */
  count: number;
  events: HookEventGroup[];
}

export interface HookEventGroup {
  event: HookEventName;
  /** True when at least one hook is attached to this event. */
  active: boolean;
  items: HookEntry[];
}

export interface HookEntry {
  matcher: string | null;
  command: string;
  /** Source: `'project'` from `settings.json`, `'local'` from `settings.local.json`. */
  source: 'project' | 'local';
}
