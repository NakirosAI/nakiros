import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ---------------------------------------------------------------------------
// Project context scanner — produces a compact summary of the target project
// so the proposal generator can reference REAL files instead of inventing
// plausible-looking paths. Everything here is best-effort and bounded: we
// never want a giant monorepo to blow the prompt size.
//
// Budget targets (roughly):
//   layout      — ≤ 200 entries, depth 3
//   packageJson — name + scripts keys + top-level deps
//   claudeMd    — first 3 KB
//   skills      — just names
// ---------------------------------------------------------------------------

const MAX_LAYOUT_ENTRIES = 200;
const MAX_LAYOUT_DEPTH = 3;
const MAX_CLAUDEMD_BYTES = 3000;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.turbo',
  '.next',
  '.cache',
  '.pnpm-store',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  '.gradle',
  '.idea',
  '.vscode',
  'tmp',
  'temp',
]);

export interface ProjectContext {
  rootPath: string;
  /** Lines of a pseudo-tree layout, already trimmed to budget. */
  layout: string;
  /** Extracted essentials from package.json when present (no versions, just shapes). */
  packageJson?: {
    name?: string;
    type?: string;
    scriptNames: string[];
    dependencyNames: string[];
  };
  /** First ~3 KB of CLAUDE.md when present. */
  claudeMd?: string;
  /** Existing skill names under .claude/skills/. */
  existingSkills: string[];
}

export function scanProjectContext(rootPath: string): ProjectContext {
  return {
    rootPath,
    layout: buildLayout(rootPath),
    packageJson: readPackageJson(rootPath),
    claudeMd: readClaudeMd(rootPath),
    existingSkills: listExistingSkills(rootPath),
  };
}

/**
 * Format the context as a prompt-ready block. Omits sections that are empty
 * so the generator doesn't get distracted by headers with no content.
 */
export function formatContextForPrompt(ctx: ProjectContext): string {
  const parts: string[] = [];
  parts.push(`<project root="${ctx.rootPath}">`);
  parts.push(`<layout>\n${ctx.layout}\n</layout>`);

  if (ctx.packageJson) {
    const pj = ctx.packageJson;
    const lines: string[] = [];
    if (pj.name) lines.push(`name: ${pj.name}`);
    if (pj.type) lines.push(`type: ${pj.type}`);
    if (pj.scriptNames.length > 0) {
      lines.push(`scripts: ${pj.scriptNames.join(', ')}`);
    }
    if (pj.dependencyNames.length > 0) {
      lines.push(`deps: ${pj.dependencyNames.slice(0, 40).join(', ')}`);
    }
    parts.push(`<package-json>\n${lines.join('\n')}\n</package-json>`);
  }

  if (ctx.claudeMd) {
    parts.push(`<claude-md>\n${ctx.claudeMd}\n</claude-md>`);
  }

  if (ctx.existingSkills.length > 0) {
    parts.push(`<existing-skills>\n${ctx.existingSkills.join('\n')}\n</existing-skills>`);
  }

  parts.push('</project>');
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function buildLayout(rootPath: string): string {
  const entries: string[] = [];
  walk(rootPath, rootPath, 0, entries);
  return entries.join('\n');
}

function walk(
  rootPath: string,
  currentPath: string,
  depth: number,
  out: string[],
): void {
  if (out.length >= MAX_LAYOUT_ENTRIES) return;
  if (depth > MAX_LAYOUT_DEPTH) return;

  let children: string[];
  try {
    children = readdirSync(currentPath);
  } catch {
    return;
  }
  children.sort();

  for (const name of children) {
    if (out.length >= MAX_LAYOUT_ENTRIES) return;
    if (SKIP_DIRS.has(name)) continue;
    if (name.startsWith('.') && depth === 0 && name !== '.claude') continue;

    const abs = join(currentPath, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(abs);
    } catch {
      continue;
    }

    const rel = relative(rootPath, abs);
    if (s.isDirectory()) {
      out.push(`${rel}/`);
      walk(rootPath, abs, depth + 1, out);
    } else if (s.isFile()) {
      out.push(rel);
    }
  }
}

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

function readPackageJson(rootPath: string): ProjectContext['packageJson'] {
  const path = join(rootPath, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    const pj = JSON.parse(readFileSync(path, 'utf8')) as {
      name?: string;
      type?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: typeof pj.name === 'string' ? pj.name : undefined,
      type: typeof pj.type === 'string' ? pj.type : undefined,
      scriptNames: pj.scripts ? Object.keys(pj.scripts) : [],
      dependencyNames: [
        ...(pj.dependencies ? Object.keys(pj.dependencies) : []),
        ...(pj.devDependencies ? Object.keys(pj.devDependencies) : []),
      ],
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md
// ---------------------------------------------------------------------------

function readClaudeMd(rootPath: string): string | undefined {
  const candidates = [join(rootPath, 'CLAUDE.md'), join(rootPath, '.claude', 'CLAUDE.md')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf8');
      return raw.length > MAX_CLAUDEMD_BYTES
        ? raw.slice(0, MAX_CLAUDEMD_BYTES) + '\n…(truncated)'
        : raw;
    } catch {
      continue;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Existing skills
// ---------------------------------------------------------------------------

function listExistingSkills(rootPath: string): string[] {
  const skillsDir = join(rootPath, '.claude', 'skills');
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir)
      .filter((name) => {
        const abs = join(skillsDir, name);
        try {
          return statSync(abs).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}
