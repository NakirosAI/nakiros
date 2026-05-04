import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

import type {
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationErrorCode,
  ClaudeMdMutationResult,
  ClaudeMdSummary,
  SaveClaudeMdRequest,
} from '@nakiros/shared';

/**
 * Read / save / delete the project-root `./CLAUDE.md`. Each save is atomic
 * with an mtime guard. Reads also extract metadata used by the editor's
 * sidebar: line count, approx token cost, top-level headings, `@<path>`
 * imports and HTML-comment presence.
 *
 * Only the root CLAUDE.md is supported — multi-scope variants
 * (`.claude/CLAUDE.md`, `CLAUDE.local.md`) have been removed.
 */

function claudeMdPath(projectPath: string): string {
  return join(projectPath, 'CLAUDE.md');
}

function err(
  code: ClaudeMdMutationErrorCode,
  message: string,
  currentMtime?: string,
): ClaudeMdMutationResult {
  return { ok: false, code, message, currentMtime };
}

export function listClaudeMd(projectPath: string): ClaudeMdListResult {
  return {
    file: buildSummary(projectPath),
    agentsMdAtRoot: existsSync(join(projectPath, 'AGENTS.md')),
    projectPath,
  };
}

export function readClaudeMd(projectPath: string): ClaudeMdFileContent | null {
  const path = claudeMdPath(projectPath);
  if (!existsSync(path)) {
    return {
      ...buildEmptySummary(projectPath),
      body: '',
      mtime: '',
    };
  }
  let body = '';
  let mtime = '';
  try {
    body = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
  const summary = buildSummaryFromContent(projectPath, body, mtime);
  return { ...summary, body, mtime };
}

export function saveClaudeMd(
  projectPath: string,
  request: SaveClaudeMdRequest,
): ClaudeMdMutationResult {
  const { body, mtimeAtRead } = request;
  const path = claudeMdPath(projectPath);

  if (mtimeAtRead && existsSync(path)) {
    let currentMtime: string;
    try {
      currentMtime = statSync(path).mtime.toISOString();
    } catch (e) {
      return err('write-failed', e instanceof Error ? e.message : String(e));
    }
    if (currentMtime !== mtimeAtRead) {
      return err(
        'conflict',
        'This file was modified outside Nakiros while you were editing. Reload to see the latest version.',
        currentMtime,
      );
    }
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, body);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }

  const file = readClaudeMd(projectPath);
  if (!file) {
    return err('write-failed', 'Could not re-read file after save.');
  }
  return { ok: true, file };
}

export function deleteClaudeMd(projectPath: string): ClaudeMdMutationResult {
  const path = claudeMdPath(projectPath);
  if (!existsSync(path)) {
    return err('not-found', 'This file does not exist.');
  }
  try {
    rmSync(path, { force: true });
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return {
    ok: true,
    file: {
      ...buildEmptySummary(projectPath),
      body: '',
      mtime: '',
    },
  };
}

// ── Summary helpers ──────────────────────────────────────────────────────-

function buildEmptySummary(projectPath: string): ClaudeMdSummary {
  return {
    path: claudeMdPath(projectPath),
    exists: false,
    lastModified: null,
    lines: 0,
    chars: 0,
    tokens: 0,
    headings: [],
    imports: [],
    hasHtmlComments: false,
  };
}

function buildSummary(projectPath: string): ClaudeMdSummary {
  const path = claudeMdPath(projectPath);
  if (!existsSync(path)) return buildEmptySummary(projectPath);
  let body = '';
  let mtime = '';
  try {
    body = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return buildEmptySummary(projectPath);
  }
  return buildSummaryFromContent(projectPath, body, mtime);
}

function buildSummaryFromContent(
  projectPath: string,
  body: string,
  mtime: string,
): ClaudeMdSummary {
  const chars = body.length;
  const lines = body === '' ? 0 : body.split(/\r?\n/).length;
  return {
    path: claudeMdPath(projectPath),
    exists: true,
    lastModified: mtime || null,
    lines,
    chars,
    tokens: Math.round(chars / 4),
    headings: extractTopLevelHeadings(body),
    imports: extractImports(body),
    hasHtmlComments: /<!--[\s\S]*?-->/m.test(body),
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

/**
 * Extract `@<path>` imports per the CLAUDE.md import syntax. Matches
 * `@README`, `@docs/git.md`, `@~/.claude/...`, `@AGENTS.md`. Skips matches
 * inside fenced code blocks so we don't pick up unrelated `@symbol`
 * mentions in code samples.
 */
function extractImports(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inCodeBlock = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const re = /@([A-Za-z0-9_./~-][\w./~@-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const path = m[1];
      // Skip likely-spurious matches that look like email addresses or
      // npm scopes (`@anthropic-ai/sdk`).
      if (path.includes('@')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
