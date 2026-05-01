import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import type {
  AgentEntry,
  AgentsInfo,
  ClaudeConfigSnapshot,
  ClaudeConfigSummary,
  ClaudeMdInfo,
  CommandEntry,
  CommandsInfo,
  EffectiveSettings,
  HookEntry,
  HookEventGroup,
  HookEventName,
  HooksInfo,
  McpInfo,
  McpServerEntry,
  OutputStyleEntry,
  OutputStylesInfo,
  ResolvedField,
  RuleEntry,
  RulesInfo,
  SettingsData,
  SettingsFile,
  SettingsHookEntry,
  SettingsHooks,
  SettingsInfo,
  SkillsGatewayInfo,
} from '@nakiros/shared';

const TOTAL_CATEGORIES = 9;
const HOOK_EVENTS: HookEventName[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionEnd',
];

/**
 * Build a read-only snapshot of a project's `.claude/` configuration.
 *
 * Surfaced by the `claudeConfig:scan` IPC channel and consumed by the
 * Configuration tab. Pure read-only — never mutates the project.
 */
export function scanClaudeConfig(projectPath: string): ClaudeConfigSnapshot {
  const claudeDir = join(projectPath, '.claude');
  const claudeMd = readClaudeMd(projectPath);
  const settings = readSettings(projectPath);
  const rules = listRules(claudeDir);
  const skills = countSkills(claudeDir);
  const commands = listCommands(claudeDir);
  const outputStyles = listOutputStyles(claudeDir);
  const agents = listAgents(claudeDir);
  const mcp = readMcp(projectPath);
  const hooks = extractHooks(settings);

  const completeness =
    (claudeMd.present ? 1 : 0) +
    (settings.present ? 1 : 0) +
    (rules.present ? 1 : 0) +
    (skills.present ? 1 : 0) +
    (commands.present ? 1 : 0) +
    (outputStyles.present ? 1 : 0) +
    (agents.present ? 1 : 0) +
    (mcp.present ? 1 : 0) +
    (hooks.present ? 1 : 0);

  // Tokens systematically injected at session start: CLAUDE.md + always-on rules
  // (rules without a `paths:` scope). Output style / commands / subagents are
  // loaded conditionally and excluded from this baseline.
  const alwaysOnRulesTokens = rules.items
    .filter((r) => r.paths.length === 0)
    .reduce((sum, r) => sum + r.tokens, 0);
  const totalTokensInjected = claudeMd.tokens + alwaysOnRulesTokens;

  const summary: ClaudeConfigSummary = {
    completeness,
    totalCategories: TOTAL_CATEGORIES,
    totalTokensInjected,
    path: claudeDir,
    scannedAt: new Date().toISOString(),
  };

  return {
    summary,
    claudeMd,
    settings,
    rules,
    skills,
    commands,
    outputStyles,
    agents,
    mcp,
    hooks,
  };
}

/**
 * Read a file from inside the project's `.claude/` directory (or `.mcp.json`
 * at the project root) by relative path, with anti-traversal protection.
 *
 * `relativePath` is resolved from `projectPath`. The resolved path must remain
 * inside `projectPath`, and must point at a file actually allowed for the
 * Configuration tab (anything under `.claude/`, plus `.mcp.json` at the root).
 *
 * Returns null on traversal, missing file, or read error.
 */
export function readClaudeConfigFile(
  projectPath: string,
  relativePath: string,
): string | null {
  const projectRoot = resolve(projectPath);
  const filePath = resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot + '/') && filePath !== projectRoot) return null;

  const rel = relative(projectRoot, filePath);
  const isMcp = rel === '.mcp.json';
  const isClaudeMdAtRoot = rel === 'CLAUDE.md';
  const isInClaudeDir = rel === '.claude' || rel.startsWith('.claude/');
  if (!isMcp && !isClaudeMdAtRoot && !isInClaudeDir) return null;

  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// ── CLAUDE.md ──────────────────────────────────────────────────────────────
function readClaudeMd(projectPath: string): ClaudeMdInfo {
  // Claude Code reads CLAUDE.md from the project root OR `.claude/CLAUDE.md`.
  const rootPath = join(projectPath, 'CLAUDE.md');
  const claudeDirPath = join(projectPath, '.claude', 'CLAUDE.md');
  const path = existsSync(rootPath) ? rootPath : claudeDirPath;

  if (!existsSync(path)) {
    return {
      present: false,
      path,
      lines: 0,
      chars: 0,
      tokens: 0,
      headings: [],
      lastModified: null,
    };
  }

  let content = '';
  let lastModified: string | null = null;
  try {
    content = readFileSync(path, 'utf8');
    lastModified = statSync(path).mtime.toISOString();
  } catch {
    // fall through with empty content
  }

  const lines = content === '' ? 0 : content.split(/\r?\n/).length;
  const chars = content.length;
  const tokens = approxTokens(chars);
  const headings = extractTopLevelHeadings(content);

  return {
    present: true,
    path,
    lines,
    chars,
    tokens,
    headings,
    lastModified,
  };
}

function extractTopLevelHeadings(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

// ── settings.json + .local ─────────────────────────────────────────────────
function readSettings(projectPath: string): SettingsInfo {
  const projectFile = readSettingsFile(join(projectPath, '.claude', 'settings.json'));
  const localFile = readSettingsFile(join(projectPath, '.claude', 'settings.local.json'));
  const present = projectFile.present || localFile.present;
  const effective = computeEffectiveSettings(projectFile, localFile);
  return { present, project: projectFile, local: localFile, effective };
}

function readSettingsFile(path: string): SettingsFile {
  if (!existsSync(path)) {
    return { present: false, path, lastModified: null, data: null };
  }
  let raw = '';
  let lastModified: string | null = null;
  try {
    raw = readFileSync(path, 'utf8');
    lastModified = statSync(path).mtime.toISOString();
  } catch {
    return { present: false, path, lastModified: null, data: null };
  }
  try {
    const data = JSON.parse(raw) as SettingsData;
    return { present: true, path, lastModified, data };
  } catch (err) {
    return {
      present: true,
      path,
      lastModified,
      data: null,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

function computeEffectiveSettings(
  project: SettingsFile,
  local: SettingsFile,
): EffectiveSettings {
  const p = project.data ?? {};
  const l = local.data ?? {};

  const localOverrides: string[] = [];
  if (local.present && local.data) {
    for (const key of Object.keys(local.data)) {
      if (p[key] !== undefined) localOverrides.push(key);
    }
  }

  return {
    model: pickResolved(p.model ?? null, l.model ?? null),
    permissions: {
      allowCount: pickResolved(
        p.permissions?.allow?.length ?? 0,
        l.permissions?.allow?.length ?? 0,
      ),
      denyCount: pickResolved(
        p.permissions?.deny?.length ?? 0,
        l.permissions?.deny?.length ?? 0,
      ),
      askCount: pickResolved(
        p.permissions?.ask?.length ?? 0,
        l.permissions?.ask?.length ?? 0,
      ),
    },
    envCount: pickResolved(
      p.env ? Object.keys(p.env).length : 0,
      l.env ? Object.keys(l.env).length : 0,
    ),
    hookCount: pickResolved(countHooks(p.hooks), countHooks(l.hooks)),
    outputStyle: pickResolved(p.outputStyle ?? null, l.outputStyle ?? null),
    localOverrides,
  };
}

function pickResolved<T>(projectVal: T, localVal: T): ResolvedField<T> {
  // Local wins when set to a meaningful value. Empty arrays / 0 / null are
  // treated as "not set" so a local file that doesn't touch a key falls back
  // to project.
  const localMeaningful =
    localVal !== null &&
    localVal !== undefined &&
    !(typeof localVal === 'number' && localVal === 0) &&
    !(typeof localVal === 'string' && localVal === '');
  const projectMeaningful =
    projectVal !== null &&
    projectVal !== undefined &&
    !(typeof projectVal === 'number' && projectVal === 0) &&
    !(typeof projectVal === 'string' && projectVal === '');

  if (localMeaningful) return { value: localVal, source: 'local' };
  if (projectMeaningful) return { value: projectVal, source: 'project' };
  return { value: projectVal, source: 'none' };
}

function countHooks(hooks: SettingsHooks | undefined): number {
  if (!hooks) return 0;
  let total = 0;
  for (const event of Object.values(hooks)) {
    if (!Array.isArray(event)) continue;
    for (const entry of event) {
      total += hookEntryCommandCount(entry);
    }
  }
  return total;
}

function hookEntryCommandCount(entry: SettingsHookEntry): number {
  if (Array.isArray(entry.hooks) && entry.hooks.length > 0) return entry.hooks.length;
  if (typeof entry.command === 'string' && entry.command.length > 0) return 1;
  return 0;
}

// ── rules ──────────────────────────────────────────────────────────────────
function listRules(claudeDir: string): RulesInfo {
  const rulesDir = join(claudeDir, 'rules');
  if (!existsSync(rulesDir)) {
    return { present: false, count: 0, totalTokens: 0, items: [] };
  }
  const files = walkMarkdown(rulesDir);
  const items: RuleEntry[] = files.map((abs) => {
    const content = safeRead(abs);
    const { fm, body } = parseFrontmatter(content);
    const paths = asStringArray(fm.paths);
    return {
      name: relative(rulesDir, abs),
      relativePath: relative(claudeDir, abs),
      paths,
      tokens: approxTokens(content.length),
      summary: firstParagraph(body, 140),
      lastModified: safeMtime(abs),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  const totalTokens = items.reduce((s, r) => s + r.tokens, 0);
  return { present: items.length > 0, count: items.length, totalTokens, items };
}

// ── skills (gateway only) ──────────────────────────────────────────────────
function countSkills(claudeDir: string): SkillsGatewayInfo {
  const skillsDir = join(claudeDir, 'skills');
  if (!existsSync(skillsDir)) return { present: false, count: 0 };
  let count = 0;
  try {
    count = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return { present: false, count: 0 };
  }
  return { present: count > 0, count };
}

// ── commands ───────────────────────────────────────────────────────────────
function listCommands(claudeDir: string): CommandsInfo {
  const dir = join(claudeDir, 'commands');
  if (!existsSync(dir)) return { present: false, count: 0, items: [] };
  const files = walkMarkdown(dir);
  const items: CommandEntry[] = files.map((abs) => {
    const content = safeRead(abs);
    const { fm } = parseFrontmatter(content);
    return {
      name: stripMdExt(relative(dir, abs)),
      relativePath: relative(claudeDir, abs),
      description: asString(fm.description),
      argumentHint: asString(fm['argument-hint']),
      tokens: approxTokens(content.length),
      lastModified: safeMtime(abs),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { present: items.length > 0, count: items.length, items };
}

// ── output styles ──────────────────────────────────────────────────────────
function listOutputStyles(claudeDir: string): OutputStylesInfo {
  const dir = join(claudeDir, 'output-styles');
  if (!existsSync(dir)) return { present: false, count: 0, items: [] };
  const files = walkMarkdown(dir);
  const items: OutputStyleEntry[] = files.map((abs) => {
    const content = safeRead(abs);
    const { fm } = parseFrontmatter(content);
    return {
      name: stripMdExt(relative(dir, abs)),
      relativePath: relative(claudeDir, abs),
      description: asString(fm.description),
      keepCodingInstructions: fm['keep-coding-instructions'] === true,
      tokens: approxTokens(content.length),
      lastModified: safeMtime(abs),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { present: items.length > 0, count: items.length, items };
}

// ── subagents ──────────────────────────────────────────────────────────────
function listAgents(claudeDir: string): AgentsInfo {
  const dir = join(claudeDir, 'agents');
  if (!existsSync(dir)) return { present: false, count: 0, items: [] };
  const files = walkMarkdown(dir);
  const items: AgentEntry[] = files.map((abs) => {
    const content = safeRead(abs);
    const { fm } = parseFrontmatter(content);
    const tools = parseToolsField(fm.tools);
    return {
      name: asString(fm.name) ?? stripMdExt(relative(dir, abs)),
      relativePath: relative(claudeDir, abs),
      description: asString(fm.description),
      tools,
      model: asString(fm.model),
      tokens: approxTokens(content.length),
      lastModified: safeMtime(abs),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { present: items.length > 0, count: items.length, items };
}

function parseToolsField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

// ── MCP servers ────────────────────────────────────────────────────────────
function readMcp(projectPath: string): McpInfo {
  const path = join(projectPath, '.mcp.json');
  if (!existsSync(path)) {
    return { present: false, count: 0, path, lastModified: null, items: [] };
  }
  let raw = '';
  let lastModified: string | null = null;
  try {
    raw = readFileSync(path, 'utf8');
    lastModified = statSync(path).mtime.toISOString();
  } catch {
    return { present: false, count: 0, path, lastModified: null, items: [] };
  }
  let parsed: { mcpServers?: Record<string, unknown> } | null = null;
  try {
    parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
  } catch (err) {
    return {
      present: true,
      count: 0,
      path,
      lastModified,
      items: [],
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
  const servers = parsed?.mcpServers ?? {};
  const items: McpServerEntry[] = Object.entries(servers).map(([name, cfg]) => {
    const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>;
    const url = asString(c.url);
    const command = asString(c.command);
    const transport: McpServerEntry['transport'] = url
      ? c.transport === 'sse'
        ? 'sse'
        : 'http'
      : command
        ? 'stdio'
        : null;
    const env = c.env && typeof c.env === 'object' ? (c.env as Record<string, unknown>) : {};
    return {
      name,
      transport,
      command,
      args: Array.isArray(c.args) ? c.args.map(String) : [],
      envKeys: Object.keys(env),
      url,
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { present: true, count: items.length, path, lastModified, items };
}

// ── hooks (derived from settings) ──────────────────────────────────────────
function extractHooks(settings: SettingsInfo): HooksInfo {
  const projectHooks = settings.project.data?.hooks ?? {};
  const localHooks = settings.local.data?.hooks ?? {};

  const events: HookEventGroup[] = HOOK_EVENTS.map((event) => {
    const items: HookEntry[] = [
      ...flattenHookSource(projectHooks[event], 'project'),
      ...flattenHookSource(localHooks[event], 'local'),
    ];
    return { event, active: items.length > 0, items };
  });

  const count = events.reduce((s, e) => s + e.items.length, 0);
  return { present: count > 0, count, events };
}

function flattenHookSource(
  entries: SettingsHookEntry[] | undefined,
  source: 'project' | 'local',
): HookEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: HookEntry[] = [];
  for (const entry of entries) {
    const matcher = entry.matcher ?? null;
    if (Array.isArray(entry.hooks) && entry.hooks.length > 0) {
      for (const h of entry.hooks) {
        if (h?.command) out.push({ matcher, command: h.command, source });
      }
    } else if (typeof entry.command === 'string' && entry.command.length > 0) {
      out.push({ matcher, command: entry.command, source });
    }
  }
  return out;
}

// ── helpers ────────────────────────────────────────────────────────────────
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkMarkdown(abs));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function safeMtime(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

function approxTokens(chars: number): number {
  return Math.round(chars / 4);
}

function stripMdExt(name: string): string {
  return name.endsWith('.md') ? name.slice(0, -3) : name;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function firstParagraph(body: string, maxChars: number): string {
  const trimmed = body.trim();
  if (trimmed === '') return '';
  const paragraph = trimmed.split(/\r?\n\s*\r?\n/)[0]
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return paragraph.length > maxChars ? paragraph.slice(0, maxChars - 1) + '…' : paragraph;
}

// ── tiny YAML frontmatter parser ───────────────────────────────────────────
// Handles the subset we need: scalars (string/bool/number), quoted strings,
// inline arrays `[a, b]`, and multi-line `- item` arrays. No nested objects,
// no anchors. If frontmatter shape gets richer, swap for the `yaml` package.
interface ParsedFrontmatter {
  fm: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) return { fm: {}, body: content };
  return { fm: parseSimpleYaml(m[1]), body: m[2] ?? '' };
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const km = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!km) {
      i++;
      continue;
    }
    const key = km[1];
    const rest = km[2].trim();
    if (rest === '') {
      const arr: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const am = /^\s+-\s+(.*)$/.exec(lines[j]);
        if (!am) break;
        arr.push(unquote(am[1].trim()));
        j++;
      }
      out[key] = arr;
      i = j;
      continue;
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      out[key] = inner === '' ? [] : inner.split(',').map((s) => unquote(s.trim()));
      i++;
      continue;
    }
    if (rest === 'true') out[key] = true;
    else if (rest === 'false') out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(rest)) out[key] = Number(rest);
    else out[key] = unquote(rest);
    i++;
  }
  return out;
}

function unquote(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
