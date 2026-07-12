import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'fs';
import type { Dirent } from 'fs';
import { join, normalize, resolve } from 'path';

import type {
  RulesAuditHistoryEntry,
  RulesListResult,
  RulesMutationResult,
  RulesReadResult,
  RuleSummary,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  listRulesAudits,
  readRulesAudit,
} from '../../services/rules-audit-history.js';
import { resolveRulePath, writeRuleFile } from '../../services/rules-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// ---------------------------------------------------------------------------
// Frontmatter / metadata helpers
// ---------------------------------------------------------------------------

interface ParsedFm {
  paths?: string | string[];
  description?: string;
  [key: string]: unknown;
}

/**
 * Parse a minimal subset of YAML frontmatter (scalar strings, inline arrays,
 * block arrays). Returns an empty record when no frontmatter is found.
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
    if (rest === '') {
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
 * Extract a human-readable description from rule file content:
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

/**
 * Extract the first `paths:` glob from the frontmatter. If it's an array,
 * return only the first element.
 */
function extractPathsGlob(content: string): string | null {
  const fm = parseFrontmatter(content);
  if (!fm.paths) return null;
  if (Array.isArray(fm.paths)) return fm.paths[0] ?? null;
  if (typeof fm.paths === 'string' && fm.paths.trim()) return fm.paths.trim();
  return null;
}

// ---------------------------------------------------------------------------
// Recursive discovery
// ---------------------------------------------------------------------------

/**
 * Walk `.claude/rules/` recursively and collect every `.md` file, returning
 * their paths relative to the `rulesDir`. Symlinks are followed one level;
 * circular symlinks are detected by comparing `realpath` against already-
 * visited real paths — on detection we skip the entry silently.
 *
 * @param rulesDir  Absolute path to `.claude/rules/`.
 * @returns Relative paths (e.g. `["i18n.md", "frontend/styling.md"]`).
 */
function discoverRules(rulesDir: string): string[] {
  if (!existsSync(rulesDir)) return [];
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

  // Seed the visited set with the rulesDir itself to detect direct self-links.
  try {
    visitedRealPaths.add(normalize(resolve(rulesDir)));
  } catch {
    // ignore
  }

  walk(rulesDir, '');
  return results;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * `rules:*` IPC channels — list / read / save / delete rule files under
 * `.claude/rules/`. Supports recursive discovery (sub-folders OK). All
 * `ruleName` values are relative paths from `.claude/rules/`. Path-traversal
 * is rejected at the handler boundary.
 *
 * IPC channels registered:
 *   - `rules:list`       — list all rules with metadata
 *   - `rules:read`       — read a single rule for editing
 *   - `rules:save`       — write a rule with mtime-based conflict detection
 *   - `rules:delete`     — delete a rule file
 *   - `rules:listAudits` — list archived audit reports for a rule
 *   - `rules:readAudit`  — read a single archived audit report
 */
export const rulesHandlers: HandlerRegistry = {
  'rules:list': createTypedHandler((projectId: string): RulesListResult => {
    const project = getProject(projectId);
    if (!project) return { rules: [] };

    const rulesDir = join(project.projectPath, '.claude', 'rules');
    const ruleNames = discoverRules(rulesDir);
    const summaries: RuleSummary[] = [];

    for (const name of ruleNames) {
      const absolutePath = join(rulesDir, name);
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
        pathsGlob: content ? extractPathsGlob(content) : null,
        description: content ? extractDescription(content) : null,
        mtime,
        sizeBytes,
        linesCount,
      });
    }

    // Sort alphabetically by name for stable ordering.
    summaries.sort((a, b) => a.name.localeCompare(b.name));
    return { rules: summaries };
  }),

  'rules:read': createTypedHandler(
    (projectId: string, ruleName: string): RulesReadResult | null => {
      const project = getProject(projectId);
      if (!project) return null;

      let absolutePath: string;
      try {
        absolutePath = resolveRulePath(project.projectPath, ruleName);
      } catch (err) {
        console.warn(`[rules:read] ${(err as Error).message}`);
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

  'rules:save': createTypedHandler(
    (
      projectId: string,
      ruleName: string,
      content: string,
      mtimeAtRead: string,
    ): RulesMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }
      return writeRuleFile(project.projectPath, ruleName, content, mtimeAtRead);
    },
  ),

  'rules:delete': createTypedHandler(
    (projectId: string, ruleName: string): RulesMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }

      let absolutePath: string;
      try {
        absolutePath = resolveRulePath(project.projectPath, ruleName);
      } catch (err) {
        return { ok: false, code: 'invalid-path', message: (err as Error).message };
      }

      if (!existsSync(absolutePath)) {
        return { ok: false, code: 'not-found', message: `Rule "${ruleName}" does not exist.` };
      }

      try {
        const stat = statSync(absolutePath);
        if (!stat.isFile()) {
          return { ok: false, code: 'not-found', message: `"${ruleName}" is not a file.` };
        }
        unlinkSync(absolutePath);
        return { ok: true };
      } catch (err) {
        return { ok: false, code: 'write-failed', message: `Failed to delete rule: ${(err as Error).message}` };
      }
    },
  ),

  'rules:listAudits': createTypedHandler(
    (projectId: string, ruleName: string): RulesAuditHistoryEntry[] => {
      return listRulesAudits(projectId, ruleName);
    },
  ),

  'rules:readAudit': createTypedHandler(
    (path: string): string | null => readRulesAudit(path),
  ),
};
