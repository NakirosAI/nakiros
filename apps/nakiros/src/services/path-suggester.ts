import { readdirSync, type Dirent } from 'fs';
import { extname, join } from 'path';

/**
 * Generate path-glob suggestions for the rule editor based on the actual
 * shape of the project: top file extensions become `**\/*.<ext>`, top
 * first-level directories become `<dir>/**`. A test pattern is added when
 * the project has at least a few `*.test.*` / `*.spec.*` files.
 *
 * No persistent cache — the walker is bounded (depth 3 and a long ignore
 * list of build/cache dirs), so a typical project is scanned in under
 * 200 ms. Suggestions are returned ordered by usefulness.
 */
export function suggestRulePaths(projectPath: string): string[] {
  const extCount = new Map<string, number>();
  const dirCount = new Map<string, number>();
  let testFiles = 0;

  walk(projectPath, projectPath, 0, MAX_DEPTH, (relPath, isDir, name) => {
    if (isDir) return;

    if (TEST_PATTERN.test(name)) testFiles++;

    const ext = extname(name).slice(1).toLowerCase();
    if (!ext || ext.length > 6 || !/^[a-z0-9]+$/.test(ext)) return;
    extCount.set(ext, (extCount.get(ext) ?? 0) + 1);

    const segs = relPath.split(/[/\\]/);
    const topDir = segs.length > 1 ? segs[0] : null;
    if (topDir && !topDir.startsWith('.')) {
      dirCount.set(topDir, (dirCount.get(topDir) ?? 0) + 1);
    }
  });

  const topExts = topN(extCount, 4);
  const topDirs = topN(dirCount, 3);

  const suggestions: string[] = [];
  for (const ext of topExts) suggestions.push(`**/*.${ext}`);
  if (testFiles >= 3 && topExts.length > 0) {
    suggestions.push(`**/*.test.${topExts[0]}`);
  }
  for (const dir of topDirs) suggestions.push(`${dir}/**`);

  // Dedup while preserving order, cap at 7.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of suggestions) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length === 7) break;
  }
  return out;
}

const MAX_DEPTH = 3;
const TEST_PATTERN = /\.(test|spec)\.[a-z0-9]+$/i;

const IGNORE_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  '.git',
  '.turbo',
  '.next',
  '.cache',
  '.parcel-cache',
  '.svelte-kit',
  '.nuxt',
  '.expo',
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.tox',
  'vendor',
  'bin',
  'obj',
  'pkg',
  '.mypy_cache',
  '.ruff_cache',
]);

function walk(
  rootPath: string,
  currentPath: string,
  depth: number,
  maxDepth: number,
  visit: (relativePath: string, isDir: boolean, name: string) => void,
): void {
  if (depth > maxDepth) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(currentPath, entry.name);
    const rel = full.slice(rootPath.length + 1);
    if (entry.isDirectory()) {
      visit(rel, true, entry.name);
      walk(rootPath, full, depth + 1, maxDepth, visit);
    } else if (entry.isFile()) {
      visit(rel, false, entry.name);
    }
  }
}

function topN(counts: Map<string, number>, n: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}
