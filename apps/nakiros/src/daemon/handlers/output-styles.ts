import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'fs';
import type { Dirent } from 'fs';
import { join, normalize, resolve } from 'path';

import type {
  OutputStyleSummary,
  OutputStylesExpertListResult,
  OutputStylesReadResult,
  OutputStylesExpertMutationResult,
  OutputStylesAuditHistoryEntry,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import {
  listOutputStylesAudits,
  readOutputStylesAudit,
} from '../../services/output-styles-audit-history.js';
import { resolveStylePath, writeOutputStyleFile } from '../../services/output-styles-writer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// ---------------------------------------------------------------------------
// Frontmatter / metadata helpers
// ---------------------------------------------------------------------------

interface ParsedFm {
  description?: string;
  name?: string;
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
 * Extract a human-readable description from style file content:
 *   1. `description:` frontmatter field (first value when it's an array).
 *   2. First `# ` heading in the body.
 */
function extractDescription(content: string): string | null {
  const fm = parseFrontmatter(content);
  if (fm.description) {
    const d = Array.isArray(fm.description) ? fm.description[0] : fm.description;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  const m = /^#\s+(.+)$/m.exec(content);
  return m ? m[1]!.trim() : null;
}

/**
 * Extract the frontmatter `name:` field (the display name of the style), or
 * null when absent.
 */
function extractDisplayName(content: string): string | null {
  const fm = parseFrontmatter(content);
  if (!fm.name) return null;
  if (typeof fm.name === 'string' && fm.name.trim()) return fm.name.trim();
  return null;
}

// ---------------------------------------------------------------------------
// Recursive discovery
// ---------------------------------------------------------------------------

/**
 * Walk `.claude/output-styles/` recursively and collect every `.md` file,
 * returning their paths relative to the `stylesDir`. Symlinks are followed
 * one level; circular symlinks are detected by comparing `realpath` against
 * already-visited real paths — on detection we skip the entry silently.
 *
 * @param stylesDir  Absolute path to `.claude/output-styles/`.
 * @returns Relative paths (e.g. `["minimal.md", "subdir/explanatory.md"]`).
 */
function discoverStyles(stylesDir: string): string[] {
  if (!existsSync(stylesDir)) return [];
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
        let real: string;
        try {
          real = normalize(resolve(entryPath));
        } catch {
          continue; // broken symlink — skip
        }
        if (visitedRealPaths.has(real)) continue; // circular — skip
        visitedRealPaths.add(real);
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

  // Seed the visited set with the stylesDir itself to detect direct self-links.
  try {
    visitedRealPaths.add(normalize(resolve(stylesDir)));
  } catch {
    // ignore
  }

  walk(stylesDir, '');
  return results;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * `outputStyles:*` IPC channels — list / read / save / delete output-style
 * files under `.claude/output-styles/`. Supports recursive discovery
 * (sub-folders OK). All `styleName` values are relative paths from
 * `.claude/output-styles/`. Path-traversal is rejected at the handler
 * boundary.
 *
 * IPC channels registered:
 *   - `outputStyles:list`       — list all styles with metadata
 *   - `outputStyles:read`       — read a single style for editing
 *   - `outputStyles:save`       — write a style with mtime-based conflict detection
 *   - `outputStyles:delete`     — delete a style file
 *   - `outputStyles:listAudits` — list archived audit reports for a style
 *   - `outputStyles:readAudit`  — read a single archived audit report
 */
export const outputStylesHandlers: HandlerRegistry = {
  'outputStyles:list': createTypedHandler((projectId: string): OutputStylesExpertListResult => {
    const project = getProject(projectId);
    if (!project) return { styles: [] };

    const stylesDir = join(project.projectPath, '.claude', 'output-styles');
    const styleNames = discoverStyles(stylesDir);
    const summaries: OutputStyleSummary[] = [];

    for (const name of styleNames) {
      const absolutePath = join(stylesDir, name);
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
        mtime = mtime || new Date(0).toISOString();
      }

      summaries.push({
        name,
        path: absolutePath,
        description: content ? extractDescription(content) : null,
        displayName: content ? extractDisplayName(content) : null,
        mtime,
        sizeBytes,
        linesCount,
      });
    }

    summaries.sort((a, b) => a.name.localeCompare(b.name));
    return { styles: summaries };
  }),

  'outputStyles:read': createTypedHandler(
    (projectId: string, styleName: string): OutputStylesReadResult | null => {
      const project = getProject(projectId);
      if (!project) return null;

      let absolutePath: string;
      try {
        absolutePath = resolveStylePath(project.projectPath, styleName);
      } catch (err) {
        console.warn(`[outputStyles:read] ${(err as Error).message}`);
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

  'outputStyles:save': createTypedHandler(
    (
      projectId: string,
      styleName: string,
      content: string,
      mtimeAtRead: string,
    ): OutputStylesExpertMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }
      return writeOutputStyleFile(project.projectPath, styleName, content, mtimeAtRead);
    },
  ),

  'outputStyles:delete': createTypedHandler(
    (projectId: string, styleName: string): OutputStylesExpertMutationResult => {
      const project = getProject(projectId);
      if (!project) {
        return { ok: false, code: 'project-not-found', message: `Project ${projectId} not found.` };
      }

      let absolutePath: string;
      try {
        absolutePath = resolveStylePath(project.projectPath, styleName);
      } catch (err) {
        return { ok: false, code: 'invalid-name', message: (err as Error).message };
      }

      if (!existsSync(absolutePath)) {
        return { ok: false, code: 'not-found', message: `Style "${styleName}" does not exist.` };
      }

      try {
        const stat = statSync(absolutePath);
        if (!stat.isFile()) {
          return { ok: false, code: 'not-found', message: `"${styleName}" is not a file.` };
        }
        unlinkSync(absolutePath);
        return { ok: true };
      } catch (err) {
        return { ok: false, code: 'fs-error', message: `Failed to delete style: ${(err as Error).message}` };
      }
    },
  ),

  'outputStyles:listAudits': createTypedHandler(
    (projectId: string, styleName: string): OutputStylesAuditHistoryEntry[] => {
      return listOutputStylesAudits(projectId, styleName);
    },
  ),

  'outputStyles:readAudit': createTypedHandler(
    (path: string): string | null => readOutputStylesAudit(path),
  ),
};
