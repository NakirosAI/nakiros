#!/usr/bin/env node
// compute-diff.mjs — Emits {added, modified, deleted} by comparing current
// source file hashes against docs/technical/.manifest.json.
//
// Usage:
//   node scripts/compute-diff.mjs                      # full repo, diff mode
//   node scripts/compute-diff.mjs --scope apps/nakiros # scoped, diff mode
//   node scripts/compute-diff.mjs --full               # every tracked file as 'modified'
//
// The agent reads ONLY this script's stdout — never walks the source tree
// itself. That keeps token cost O(changed files), not O(repo size).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, sep } from 'node:path';

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs/technical');
const MANIFEST_PATH = join(DOCS_DIR, '.manifest.json');
const IGNORE_PATH = join(DOCS_DIR, '.ignore');

const INCLUDE_ROOTS = ['apps', 'packages'];
const INCLUDE_EXTS = ['.ts', '.tsx'];

// Hard-coded excludes — match paths in POSIX form (forward slashes).
const DEFAULT_EXCLUDES = [
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\.d\.ts$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /(^|\/)generated\//,
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', '.turbo', '.next', 'coverage']);

function parseArgs(argv) {
  const args = { scope: null, full: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') args.scope = argv[++i];
    else if (a === '--full') args.full = true;
  }
  return args;
}

function readUserIgnores() {
  if (!existsSync(IGNORE_PATH)) return [];
  return readFileSync(IGNORE_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch {
        process.stderr.write(`compute-diff: invalid regex in .ignore skipped: ${pattern}\n`);
        return null;
      }
    })
    .filter(Boolean);
}

function toPosix(p) {
  return p.split(sep).join('/');
}

function isExcluded(relPosix, userExcludes) {
  if (DEFAULT_EXCLUDES.some((re) => re.test(relPosix))) return true;
  if (userExcludes.some((re) => re.test(relPosix))) return true;
  return false;
}

// Walk a directory and push every source file that lives under a `src/`
// segment. The Nakiros convention is that all real code is under
// `<package>/src/...` — TypeScript at the root of a package is almost always
// config or build glue and should not be documented.
function walkPackage(packageRoot, relBase, out) {
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = join(packageRoot, entry.name);
    const rel = join(relBase, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'src') {
        walkDeep(full, rel, out);
      } else {
        walkPackage(full, rel, out);
      }
    }
  }
}

function walkDeep(dir, relBase, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = join(relBase, entry.name);
    if (entry.isDirectory()) {
      walkDeep(full, rel, out);
    } else if (entry.isFile()) {
      if (INCLUDE_EXTS.some((ext) => entry.name.endsWith(ext))) {
        out.push(rel);
      }
    }
  }
}

function collectSources(scope) {
  const out = [];
  for (const rootDir of INCLUDE_ROOTS) {
    const full = join(ROOT, rootDir);
    if (!existsSync(full)) continue;
    walkPackage(full, rootDir, out);
  }
  if (!scope) return out;
  const scopePosix = toPosix(scope).replace(/\/$/, '');
  return out.filter((p) => {
    const posix = toPosix(p);
    return posix === scopePosix || posix.startsWith(scopePosix + '/');
  });
}

function sha256(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, files: {} };
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (!parsed.files) parsed.files = {};
    return parsed;
  } catch (e) {
    process.stderr.write(`compute-diff: manifest unreadable (${e.message}) — treating as empty\n`);
    return { version: 1, files: {} };
  }
}

function main() {
  const args = parseArgs(process.argv);
  const userExcludes = readUserIgnores();
  const manifest = loadManifest();
  const prev = manifest.files;

  const sources = collectSources(args.scope)
    .map(toPosix)
    .filter((p) => !isExcluded(p, userExcludes))
    .sort();

  const current = {};
  for (const rel of sources) {
    current[rel] = sha256(join(ROOT, rel));
  }

  const added = [];
  const modified = [];
  const unchanged = [];
  for (const [p, hash] of Object.entries(current)) {
    if (!(p in prev)) added.push(p);
    else if (prev[p] !== hash) modified.push(p);
    else unchanged.push(p);
  }

  const scopePosix = args.scope ? toPosix(args.scope).replace(/\/$/, '') : null;
  const deleted = [];
  for (const p of Object.keys(prev)) {
    if (scopePosix && p !== scopePosix && !p.startsWith(scopePosix + '/')) continue;
    if (!(p in current)) deleted.push(p);
  }

  let payload;
  if (args.full) {
    payload = {
      mode: 'full',
      added: [],
      modified: [...added, ...modified, ...unchanged].sort(),
      deleted,
      unchanged_count: 0,
      total: sources.length,
    };
  } else {
    payload = {
      mode: 'diff',
      added: added.sort(),
      modified: modified.sort(),
      deleted: deleted.sort(),
      unchanged_count: unchanged.length,
      total: sources.length,
    };
  }

  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

main();
