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
  ClaudeMdScope,
  ClaudeMdSummary,
  SaveClaudeMdRequest,
} from '@nakiros/shared';

/**
 * Read / save / delete the project's CLAUDE.md across its three project-
 * scoped locations (`root`, `claude-dir`, `local`). Each save is atomic
 * with an mtime guard. Reads also extract metadata used by the editor's
 * sidebar: line count, approx token cost, top-level headings, `@<path>`
 * imports and HTML-comment presence.
 *
 * The user-global `~/.claude/CLAUDE.md` is intentionally out of scope —
 * V2 stays project-only (cf. phase 2 memory).
 */

const SCOPES: ClaudeMdScope[] = ['root', 'claude-dir', 'local'];

function pathFor(projectPath: string, scope: ClaudeMdScope): string {
  switch (scope) {
    case 'root':
      return join(projectPath, 'CLAUDE.md');
    case 'claude-dir':
      return join(projectPath, '.claude', 'CLAUDE.md');
    case 'local':
      return join(projectPath, 'CLAUDE.local.md');
  }
}

function err(
  code: ClaudeMdMutationErrorCode,
  message: string,
  currentMtime?: string,
): ClaudeMdMutationResult {
  return { ok: false, code, message, currentMtime };
}

export function listClaudeMd(projectPath: string): ClaudeMdListResult {
  const files: ClaudeMdSummary[] = SCOPES.map((scope) => buildSummary(projectPath, scope));
  return {
    files,
    agentsMdAtRoot: existsSync(join(projectPath, 'AGENTS.md')),
    projectPath,
  };
}

export function readClaudeMd(
  projectPath: string,
  scope: ClaudeMdScope,
): ClaudeMdFileContent | null {
  const path = pathFor(projectPath, scope);
  if (!existsSync(path)) {
    return {
      ...buildEmptySummary(projectPath, scope),
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
  const summary = buildSummaryFromContent(projectPath, scope, body, mtime);
  return { ...summary, body, mtime };
}

export function saveClaudeMd(
  projectPath: string,
  request: SaveClaudeMdRequest,
): ClaudeMdMutationResult {
  const { scope, body, mtimeAtRead } = request;
  const path = pathFor(projectPath, scope);

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

  const file = readClaudeMd(projectPath, scope);
  if (!file) {
    return err('write-failed', 'Could not re-read file after save.');
  }
  return { ok: true, file };
}

export function deleteClaudeMd(
  projectPath: string,
  scope: ClaudeMdScope,
): ClaudeMdMutationResult {
  const path = pathFor(projectPath, scope);
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
      ...buildEmptySummary(projectPath, scope),
      body: '',
      mtime: '',
    },
  };
}

// ── Summary helpers ──────────────────────────────────────────────────────-

function buildEmptySummary(projectPath: string, scope: ClaudeMdScope): ClaudeMdSummary {
  return {
    scope,
    path: pathFor(projectPath, scope),
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

function buildSummary(projectPath: string, scope: ClaudeMdScope): ClaudeMdSummary {
  const path = pathFor(projectPath, scope);
  if (!existsSync(path)) return buildEmptySummary(projectPath, scope);
  let body = '';
  let mtime = '';
  try {
    body = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return buildEmptySummary(projectPath, scope);
  }
  return buildSummaryFromContent(projectPath, scope, body, mtime);
}

function buildSummaryFromContent(
  projectPath: string,
  scope: ClaudeMdScope,
  body: string,
  mtime: string,
): ClaudeMdSummary {
  const chars = body.length;
  const lines = body === '' ? 0 : body.split(/\r?\n/).length;
  return {
    scope,
    path: pathFor(projectPath, scope),
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
