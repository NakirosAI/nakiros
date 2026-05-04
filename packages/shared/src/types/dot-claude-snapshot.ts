/**
 * Read-only snapshot of a project's entire `.claude/` ecosystem produced by
 * `buildDotClaudeSnapshot`. Consumed by `.claude/` experts (claudemd, rules,
 * subagents, …) as cross-entity context so they can detect coherence issues
 * across the full configuration in a single pass.
 *
 * All arrays are always present (empty when no items exist) — consumers iterate
 * without null-guards.
 */
export interface DotClaudeSnapshot {
  /** Stable project identifier (encoded project path or registry id). */
  projectId: string;
  /** Absolute path to the project root. */
  projectPath: string;
  /** ISO 8601 timestamp when this snapshot was generated. */
  generatedAt: string;

  claudemd: DotClaudeSnapshotClaudeMd;
  rules: DotClaudeSnapshotRule[];
  subagents: DotClaudeSnapshotSubagent[];
  hooks: DotClaudeSnapshotHook[];
  permissions: DotClaudeSnapshotPermissions;
  mcpServers: DotClaudeSnapshotMcpServer[];
  outputStyles: DotClaudeSnapshotOutputStyle[];
  skills: DotClaudeSnapshotSkill[];
}

// ── CLAUDE.md ──────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotClaudeMd {
  exists: boolean;
  /** Absolute path — always set, even when the file does not exist. */
  path: string;
  totalLines: number;
  /** Top-level `##` section headings in document order. */
  sections: string[];
  /**
   * `@<path>` imports detected in the content (e.g. `@RTK.md`, `@AGENTS.md`).
   * Extracted from non-fenced lines only.
   */
  imports: string[];
  /** Full file content when `exists` is true, empty string otherwise. */
  content: string;
}

// ── Rules ──────────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotRule {
  /** Filename without `.md` extension. */
  name: string;
  /** Absolute path to the rule file. */
  path: string;
  /** Globs from frontmatter `paths:` field; empty array when not specified. */
  pathsGlob: string[];
  /**
   * Frontmatter `description:` if present, otherwise the first H1 heading,
   * otherwise empty string.
   */
  description: string;
  /** Full file content. */
  content: string;
}

// ── Subagents ──────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotSubagent {
  /** Agent name from frontmatter `name:` or filename without `.md`. */
  name: string;
  /** Absolute path to the agent file. */
  path: string;
  /** Frontmatter `model:` or null when not specified. */
  model: string | null;
  /** Frontmatter `description:` or first non-empty line of body. */
  description: string;
  /** Frontmatter `tools:` parsed as an array; empty array when not specified. */
  tools: string[];
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotHook {
  /** Lifecycle event name (e.g. `PreToolUse`, `PostToolUse`, `Stop`). */
  event: string;
  /** Regex matcher when defined on the hook entry; null otherwise. */
  matcher: string | null;
  /** Shell command executed when the hook fires. */
  command: string;
  /** Whether this hook comes from the project settings or the user-global settings. */
  scope: 'project' | 'user';
}

// ── Permissions ────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotPermissions {
  allow: string[];
  deny: string[];
  /**
   * `'project'` — only project settings.json has permissions.
   * `'user'`    — only ~/.claude/settings.json has permissions.
   * `'mixed'`   — both sources contribute.
   * `'none'`    — no permissions defined anywhere.
   */
  scope: 'project' | 'user' | 'mixed' | 'none';
}

// ── MCP servers ────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotMcpServer {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  /** For stdio servers: the executable command; null otherwise. */
  command: string | null;
  /** For sse/http servers: the endpoint URL; null otherwise. */
  url: string | null;
}

// ── Output styles ──────────────────────────────────────────────────────────

export interface DotClaudeSnapshotOutputStyle {
  /** Filename without `.md` extension. */
  name: string;
  /** Absolute path to the output style file. */
  path: string;
  /** `'project'` when under `{projectPath}/.claude/output-styles/`; `'user'` for `~/.claude/output-styles/`. */
  scope: 'project' | 'user';
}

// ── Skills ─────────────────────────────────────────────────────────────────

export interface DotClaudeSnapshotSkill {
  /** Skill directory name. */
  name: string;
  /** Description extracted from SKILL.md frontmatter `description:` or first H1. */
  description: string;
  /**
   * `'project'`         — under `{projectPath}/.claude/skills/<name>/`.
   * `'user'`            — under `~/.claude/skills/<name>/`.
   * `'nakiros-bundled'` — shipped inside the Nakiros daemon binary.
   */
  scope: 'project' | 'user' | 'nakiros-bundled';
  /** Absolute path to the skill directory. */
  path: string;
}
