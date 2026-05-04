import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  DotClaudeSnapshot,
  DotClaudeSnapshotClaudeMd,
  DotClaudeSnapshotHook,
  DotClaudeSnapshotMcpServer,
  DotClaudeSnapshotOutputStyle,
  DotClaudeSnapshotPermissions,
  DotClaudeSnapshotRule,
  DotClaudeSnapshotSkill,
  DotClaudeSnapshotSubagent,
} from '@nakiros/shared';

import { getNakirosSkillsDir } from './bundled-skills-sync.js';

// ── Frontmatter parser (subset: scalars, inline arrays, block arrays) ──────

interface ParsedFm {
  fm: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFm {
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
    if (!line || /^\s*#/.test(line)) { i++; continue; }
    const km = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!km) { i++; continue; }
    const key = km[1];
    const rest = km[2].trim();
    if (rest === '') {
      // Multi-line block list: gather following `- item` lines
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const li = lines[i];
        const m2 = /^\s+-\s+(.+)$/.exec(li ?? '');
        if (!m2) break;
        items.push(m2[1].replace(/^['"]|['"]$/g, ''));
        i++;
      }
      out[key] = items.length > 0 ? items : '';
      continue;
    }
    if (rest.startsWith('[')) {
      // Inline array: [a, b, c]
      const inner = rest.slice(1, rest.lastIndexOf(']'));
      out[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
    } else {
      out[key] = rest.replace(/^['"]|['"]$/g, '');
    }
    i++;
  }
  return out;
}

// ── Small helpers ──────────────────────────────────────────────────────────

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return [];
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  let entries: import('fs').Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMarkdown(abs));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { return []; }
}

/** Extract `@<path>` imports from CLAUDE.md content (skip fenced blocks). */
function extractImports(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inCode = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const re = /@([A-Za-z0-9_./~-][\w./~@-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const path = m[1];
      if (path.includes('@')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/** Extract `##` section headings from content. */
function extractSections(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** First non-empty non-heading line of body, up to maxChars. */
function firstBodyLine(body: string, maxChars = 200): string {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.replace(/^#+\s+/, '').trim();
    if (trimmed) return trimmed.slice(0, maxChars);
  }
  return '';
}

// ── Section builders ──────────────────────────────────────────────────────

function buildClaudeMd(projectPath: string): DotClaudeSnapshotClaudeMd {
  const path = join(projectPath, 'CLAUDE.md');
  if (!existsSync(path)) {
    return { exists: false, path, totalLines: 0, sections: [], imports: [], content: '' };
  }
  const content = safeRead(path);
  const lines = content === '' ? 0 : content.split(/\r?\n/).length;
  return {
    exists: true,
    path,
    totalLines: lines,
    sections: extractSections(content),
    imports: extractImports(content),
    content,
  };
}

function buildRules(projectPath: string): DotClaudeSnapshotRule[] {
  const rulesDir = join(projectPath, '.claude', 'rules');
  if (!existsSync(rulesDir)) return [];
  const files = walkMarkdown(rulesDir);
  return files.map((abs) => {
    const content = safeRead(abs);
    const { fm, body } = parseFrontmatter(content);
    const name = abs.slice(rulesDir.length + 1).replace(/\.md$/, '');
    const descFromFm = asStr(fm.description);
    const descFromH1 = firstBodyLine(body);
    return {
      name,
      path: abs,
      pathsGlob: asStrArray(fm.paths),
      description: descFromFm ?? descFromH1,
      content,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function buildSubagents(projectPath: string): DotClaudeSnapshotSubagent[] {
  const agentsDir = join(projectPath, '.claude', 'agents');
  if (!existsSync(agentsDir)) return [];
  const files = walkMarkdown(agentsDir);
  return files.map((abs) => {
    const content = safeRead(abs);
    const { fm, body } = parseFrontmatter(content);
    const basename = abs.slice(agentsDir.length + 1).replace(/\.md$/, '');
    return {
      name: asStr(fm.name) ?? basename,
      path: abs,
      model: asStr(fm.model),
      description: asStr(fm.description) ?? firstBodyLine(body),
      tools: asStrArray(fm.tools),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

interface RawSettings {
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: Record<string, unknown[]>;
}

function readSettingsJson(path: string): RawSettings | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RawSettings;
  } catch { return null; }
}

function buildHooks(projectPath: string): DotClaudeSnapshotHook[] {
  const projectSettingsPath = join(projectPath, '.claude', 'settings.json');
  const userSettingsPath = join(homedir(), '.claude', 'settings.json');

  const projectData = readSettingsJson(projectSettingsPath);
  const userData = readSettingsJson(userSettingsPath);

  const out: DotClaudeSnapshotHook[] = [];

  function flatten(data: RawSettings | null, scope: 'project' | 'user'): void {
    if (!data?.hooks) return;
    for (const [event, entries] of Object.entries(data.hooks)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const matcher = asStr(e.matcher);
        if (Array.isArray(e.hooks)) {
          for (const h of e.hooks as Record<string, unknown>[]) {
            const cmd = asStr(h?.command);
            if (cmd) out.push({ event, matcher, command: cmd, scope });
          }
        } else {
          const cmd = asStr(e.command);
          if (cmd) out.push({ event, matcher, command: cmd, scope });
        }
      }
    }
  }

  flatten(projectData, 'project');
  flatten(userData, 'user');
  return out;
}

function buildPermissions(projectPath: string): DotClaudeSnapshotPermissions {
  const projectSettingsPath = join(projectPath, '.claude', 'settings.json');
  const userSettingsPath = join(homedir(), '.claude', 'settings.json');

  const project = readSettingsJson(projectSettingsPath);
  const user = readSettingsJson(userSettingsPath);

  const projectAllow = project?.permissions?.allow ?? [];
  const projectDeny = project?.permissions?.deny ?? [];
  const userAllow = user?.permissions?.allow ?? [];
  const userDeny = user?.permissions?.deny ?? [];

  const hasProject = projectAllow.length > 0 || projectDeny.length > 0;
  const hasUser = userAllow.length > 0 || userDeny.length > 0;

  let scope: DotClaudeSnapshotPermissions['scope'];
  if (hasProject && hasUser) scope = 'mixed';
  else if (hasProject) scope = 'project';
  else if (hasUser) scope = 'user';
  else scope = 'none';

  return {
    allow: [...projectAllow, ...userAllow],
    deny: [...projectDeny, ...userDeny],
    scope,
  };
}

function buildMcpServers(projectPath: string): DotClaudeSnapshotMcpServer[] {
  // Primary: .mcp.json at project root. Fallback: settings.json mcpServers key.
  const mcpPath = join(projectPath, '.mcp.json');
  let raw = '';
  if (existsSync(mcpPath)) {
    raw = safeRead(mcpPath);
  } else {
    const settingsPath = join(projectPath, '.claude', 'settings.json');
    raw = safeRead(settingsPath);
  }
  if (!raw) return [];
  type McpJson = { mcpServers?: Record<string, unknown> };
  let parsed: McpJson | null = null;
  try { parsed = JSON.parse(raw) as McpJson; } catch { return []; }
  const servers = parsed?.mcpServers ?? {};
  return Object.entries(servers).map(([name, cfg]) => {
    const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>;
    const url = asStr(c.url);
    const command = asStr(c.command);
    let type: DotClaudeSnapshotMcpServer['type'];
    if (url) {
      type = c.transport === 'sse' ? 'sse' : 'http';
    } else {
      type = 'stdio';
    }
    return { name, type, command, url };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function buildOutputStyles(projectPath: string): DotClaudeSnapshotOutputStyle[] {
  const projectDir = join(projectPath, '.claude', 'output-styles');
  const userDir = join(homedir(), '.claude', 'output-styles');
  const out: DotClaudeSnapshotOutputStyle[] = [];

  if (existsSync(projectDir)) {
    for (const f of walkMarkdown(projectDir)) {
      out.push({ name: f.slice(projectDir.length + 1).replace(/\.md$/, ''), path: f, scope: 'project' });
    }
  }
  if (existsSync(userDir)) {
    for (const f of walkMarkdown(userDir)) {
      out.push({ name: f.slice(userDir.length + 1).replace(/\.md$/, ''), path: f, scope: 'user' });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function skillDescriptionFromSkillMd(skillMdContent: string): string {
  const { fm, body } = parseFrontmatter(skillMdContent);
  const fromFm = asStr(fm.description);
  if (fromFm) return fromFm;
  return firstBodyLine(body);
}

function buildSkills(projectPath: string): DotClaudeSnapshotSkill[] {
  const out: DotClaudeSnapshotSkill[] = [];

  // Project-scoped skills
  const projectSkillsDir = join(projectPath, '.claude', 'skills');
  for (const name of listSubdirs(projectSkillsDir)) {
    const skillDir = join(projectSkillsDir, name);
    const content = safeRead(join(skillDir, 'SKILL.md'));
    out.push({ name, description: skillDescriptionFromSkillMd(content), scope: 'project', path: skillDir });
  }

  // User-global skills (~/.claude/skills)
  const userSkillsDir = join(homedir(), '.claude', 'skills');
  for (const name of listSubdirs(userSkillsDir)) {
    const skillDir = join(userSkillsDir, name);
    const content = safeRead(join(skillDir, 'SKILL.md'));
    out.push({ name, description: skillDescriptionFromSkillMd(content), scope: 'user', path: skillDir });
  }

  // Nakiros bundled skills (~/.nakiros/skills after sync)
  const nakirosDir = getNakirosSkillsDir();
  for (const name of listSubdirs(nakirosDir)) {
    const skillDir = join(nakirosDir, name);
    const content = safeRead(join(skillDir, 'SKILL.md'));
    out.push({ name, description: skillDescriptionFromSkillMd(content), scope: 'nakiros-bundled', path: skillDir });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a read-only snapshot of a project's entire `.claude/` ecosystem.
 *
 * Graceful against missing files/directories — every array defaults to empty.
 * Synchronous (all I/O via `readFileSync`). Intended to be called just before
 * spawning a `.claude/` expert agent so it can read the snapshot via its
 * `Read` tool.
 */
export function buildDotClaudeSnapshot(input: {
  projectId: string;
  projectPath: string;
}): DotClaudeSnapshot {
  const { projectId, projectPath } = input;
  return {
    projectId,
    projectPath,
    generatedAt: new Date().toISOString(),
    claudemd: buildClaudeMd(projectPath),
    rules: buildRules(projectPath),
    subagents: buildSubagents(projectPath),
    hooks: buildHooks(projectPath),
    permissions: buildPermissions(projectPath),
    mcpServers: buildMcpServers(projectPath),
    outputStyles: buildOutputStyles(projectPath),
    skills: buildSkills(projectPath),
  };
}
