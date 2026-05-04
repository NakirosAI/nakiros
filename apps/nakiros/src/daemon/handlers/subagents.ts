import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import type { Dirent } from 'fs';
import { join, normalize, resolve, dirname } from 'path';

import type {
  SubagentsAuditHistoryEntry,
  SubagentsListResult,
  SubagentsMutationResult,
  SubagentsReadResult,
  SubagentSummary,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  listSubagentsAudits,
  readSubagentsAudit,
} from '../../services/subagents-audit-history.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Validate that `subagentName` is safe (no `..`, no leading `/`) and that
 * the resolved absolute path stays within `agentsDir`. Returns the resolved
 * absolute path on success, throws on traversal attempt.
 */
function resolveSubagentPath(projectPath: string, subagentName: string): string {
  // Reject any path component that could escape the agents directory.
  if (subagentName.includes('..') || subagentName.startsWith('/')) {
    throw new Error(`Invalid subagentName — path traversal detected: ${subagentName}`);
  }
  const agentsDir = join(projectPath, '.claude', 'agents');
  const resolved = normalize(resolve(agentsDir, subagentName));
  // Ensure the resolved path stays inside the agents directory.
  if (!resolved.startsWith(normalize(agentsDir) + '/') && resolved !== normalize(agentsDir)) {
    throw new Error(`Invalid subagentName — path escapes .claude/agents/: ${subagentName}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Frontmatter / metadata helpers
// ---------------------------------------------------------------------------

interface ParsedFm {
  description?: string | string[];
  model?: string;
  tools?: string | string[];
  [key: string]: unknown;
}

/**
 * Parse a minimal subset of YAML frontmatter (scalar strings, inline arrays,
 * block arrays, block scalars). Returns an empty record when no frontmatter
 * is found.
 */
function parseFrontmatter(content: string): ParsedFm {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) return {};
  const fm: Record<string, unknown> = {};
  const lines = (m[1] ?? '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || /^\s*#/.test(line)) { i++; continue; }
    const km = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!km) { i++; continue; }
    const key = km[1]!;
    const rest = (km[2] ?? '').trim();
    if (rest === '' || rest === '>') {
      // Block list or block scalar — gather following indented / `- item` lines.
      if (rest === '>') {
        // Block scalar: gather non-empty, indented continuation lines.
        const chunks: string[] = [];
        i++;
        while (i < lines.length) {
          const li = lines[i] ?? '';
          if (/^\s+/.test(li) && li.trim()) {
            chunks.push(li.trim());
            i++;
          } else {
            break;
          }
        }
        fm[key] = chunks.join(' ');
      } else {
        // Block list — gather following `- item` lines.
        const items: string[] = [];
        i++;
        while (i < lines.length) {
          const li = lines[i] ?? '';
          const m2 = /^\s+-\s+(.+)$/.exec(li);
          if (!m2) break;
          items.push(m2[1]!.trim());
          i++;
        }
        fm[key] = items;
      }
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      // Inline array.
      const items = rest
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      fm[key] = items;
    } else {
      fm[key] = rest.replace(/^["']|["']$/g, '');
      i++;
    }
  }
  return fm as ParsedFm;
}

/**
 * Extract a human-readable description from subagent file content:
 *   1. `description:` frontmatter field (first value when it's an array).
 *   2. First `# ` heading in the body.
 */
function extractDescription(content: string): string | null {
  const fm = parseFrontmatter(content);
  if (fm.description) {
    const d = Array.isArray(fm.description) ? fm.description[0] : fm.description;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  // Fall back to first H1 in the body.
  const m = /^#\s+(.+)$/m.exec(content);
  return m ? m[1]!.trim() : null;
}

/** Extract the `model:` frontmatter field, or null when absent. */
function extractModel(content: string): string | null {
  const fm = parseFrontmatter(content);
  if (typeof fm.model === 'string' && fm.model.trim()) return fm.model.trim();
  return null;
}

/** Extract the `tools:` frontmatter field as an array of strings. */
function extractTools(content: string): string[] {
  const fm = parseFrontmatter(content);
  if (!fm.tools) return [];
  if (Array.isArray(fm.tools)) return fm.tools as string[];
  if (typeof fm.tools === 'string' && fm.tools.trim()) {
    // Comma-separated or single value.
    return fm.tools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Recursive discovery
// ---------------------------------------------------------------------------

/**
 * Walk `.claude/agents/` recursively and collect every `.md` file, returning
 * their paths relative to the `agentsDir`. Symlinks are followed one level;
 * circular symlinks are detected by comparing `realpath` against already-
 * visited real paths — on detection we skip the entry silently.
 *
 * @param agentsDir  Absolute path to `.claude/agents/`.
 * @returns Relative paths (e.g. `["backend.md", "team/reviewer.md"]`).
 */
function discoverSubagents(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) return [];
  const results: string[] = [];
  const visitedRealPaths = new Set<string>();

  function walk(dir: string, prefix: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        // Resolve the symlink and check for cycles.
        let real: string;
        try {
          real = normalize(resolve(entryPath));
        } catch {
          continue; // broken symlink — skip
        }
        if (visitedRealPaths.has(real)) continue; // circular — skip
        visitedRealPaths.add(real);
        // Determine what the symlink points to.
        let targetStat: ReturnType<typeof statSync>;
        try {
          targetStat = statSync(entryPath);
        } catch {
          continue;
        }
        if (targetStat.isDirectory()) {
          walk(entryPath, prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (targetStat.isFile() && entry.name.endsWith('.md')) {
          results.push(prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      } else if (entry.isDirectory()) {
        walk(entryPath, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(prefix ? `${prefix}/${entry.name}` : entry.name);
      }
    }
  }

  // Seed the visited set with the agentsDir itself to detect direct self-links.
  try {
    visitedRealPaths.add(normalize(resolve(agentsDir)));
  } catch {
    // ignore
  }

  walk(agentsDir, '');
  return results;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * `subagents:*` IPC channels — list / read / save / delete subagent files under
 * `.claude/agents/`. Supports recursive discovery (sub-folders OK). All
 * `subagentName` values are relative filenames from `.claude/agents/`.
 * Path-traversal is rejected at the handler boundary.
 *
 * IPC channels registered:
 *   - `subagents:list`       — list all subagents with metadata
 *   - `subagents:read`       — read a single subagent for editing
 *   - `subagents:save`       — write a subagent with mtime-based conflict detection
 *   - `subagents:delete`     — delete a subagent file
 *   - `subagents:listAudits` — list archived audit reports for a subagent
 *   - `subagents:readAudit`  — read a single archived audit report
 */
export const subagentsHandlers: HandlerRegistry = {
  'subagents:list': createTypedHandler((projectId: string): SubagentsListResult => {
    const project = getProject(projectId);
    if (!project) return { subagents: [] };

    const agentsDir = join(project.projectPath, '.claude', 'agents');
    const subagentNames = discoverSubagents(agentsDir);
    const summaries: SubagentSummary[] = [];

    for (const name of subagentNames) {
      const absolutePath = join(agentsDir, name);
      let content = '';
      let sizeBytes = 0;
      let mtime = '';
      let linesCount = 0;

      try {
        const stat = statSync(absolutePath);
        sizeBytes = stat.size;
        mtime = stat.mtime.toISOString();
        content = readFileSync(absolutePath, 'utf8');
        linesCount = content.split('\n').filter((l) => l.trim().length > 0).length;
      } catch {
        // Skip unreadable files — they appear in the list without metadata.
        mtime = mtime || new Date(0).toISOString();
      }

      summaries.push({
        name,
        path: absolutePath,
        description: content ? extractDescription(content) : null,
        model: content ? extractModel(content) : null,
        tools: content ? extractTools(content) : [],
        mtime,
        sizeBytes,
        linesCount,
      });
    }

    // Sort alphabetically by name for stable ordering.
    summaries.sort((a, b) => a.name.localeCompare(b.name));
    return { subagents: summaries };
  }),

  'subagents:read': createTypedHandler(
    (projectId: string, subagentName: string): SubagentsReadResult | null => {
      const project = getProject(projectId);
      if (!project) return null;

      let absolutePath: string;
      try {
        absolutePath = resolveSubagentPath(project.projectPath, subagentName);
      } catch (err) {
        console.warn(`[subagents:read] ${(err as Error).message}`);
        return null;
      }

      if (!existsSync(absolutePath)) {
        return {
          content: '',
          mtime: '',
          exists: false,
          path: absolutePath,
        };
      }

      try {
        const stat = statSync(absolutePath);
        if (!stat.isFile()) return null;
        const content = readFileSync(absolutePath, 'utf8');
        return {
          content,
          mtime: stat.mtime.toISOString(),
          exists: true,
          path: absolutePath,
        };
      } catch {
        return null;
      }
    },
  ),

  'subagents:save': createTypedHandler(
    (
      projectId: string,
      subagentName: string,
      content: string,
      mtimeAtRead: string,
    ): SubagentsMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }

      let absolutePath: string;
      try {
        absolutePath = resolveSubagentPath(project.projectPath, subagentName);
      } catch (err) {
        return { ok: false, code: 'invalid-path', message: (err as Error).message };
      }

      // Optimistic-lock: if the file exists and was modified since read, reject.
      if (existsSync(absolutePath) && mtimeAtRead) {
        try {
          const stat = statSync(absolutePath);
          const currentMtime = stat.mtime.toISOString();
          if (currentMtime !== mtimeAtRead) {
            return { ok: false, code: 'conflict', message: `Subagent "${subagentName}" was modified externally. Reload to continue.` };
          }
        } catch {
          // Can't stat — proceed with write (best-effort).
        }
      }

      try {
        // Ensure the parent directory exists (handles nested subagents like team/reviewer.md).
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content, 'utf8');
        return { ok: true };
      } catch (err) {
        return { ok: false, code: 'write-failed', message: `Failed to write subagent: ${(err as Error).message}` };
      }
    },
  ),

  'subagents:delete': createTypedHandler(
    (projectId: string, subagentName: string): SubagentsMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }

      let absolutePath: string;
      try {
        absolutePath = resolveSubagentPath(project.projectPath, subagentName);
      } catch (err) {
        return { ok: false, code: 'invalid-path', message: (err as Error).message };
      }

      if (!existsSync(absolutePath)) {
        return { ok: false, code: 'not-found', message: `Subagent "${subagentName}" does not exist.` };
      }

      try {
        const stat = statSync(absolutePath);
        if (!stat.isFile()) {
          return { ok: false, code: 'not-found', message: `"${subagentName}" is not a file.` };
        }
        unlinkSync(absolutePath);
        return { ok: true };
      } catch (err) {
        return { ok: false, code: 'write-failed', message: `Failed to delete subagent: ${(err as Error).message}` };
      }
    },
  ),

  'subagents:listAudits': createTypedHandler(
    (projectId: string, subagentName: string): SubagentsAuditHistoryEntry[] => {
      return listSubagentsAudits(projectId, subagentName);
    },
  ),

  'subagents:readAudit': createTypedHandler(
    (path: string): string | null => readSubagentsAudit(path),
  ),
};
