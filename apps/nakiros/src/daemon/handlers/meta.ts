import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersionInfo } from '../../services/version-service.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';
import type { GetChangelogResult } from '@nakiros/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cached resolved path to CHANGELOG.md, resolved once on first call. */
let resolvedChangelogPath: string | null | undefined = undefined;

/**
 * Walk up from `startDir` to find the workspace root (first directory that
 * contains `pnpm-workspace.yaml`). Returns `null` if not found.
 */
function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Resolve the path to `CHANGELOG.md`, trying multiple candidate locations so
 * the same code works in production (`dist/bin/nakiros.js`) and dev
 * (`tsx bin/nakiros.ts`).
 *
 * Search order:
 * 1. `<__dirname>/../CHANGELOG.md`  (prod: `dist/bin/` → `dist/CHANGELOG.md`)
 * 2. `<__dirname>/../../CHANGELOG.md` (alternative prod layout)
 * 3. Workspace root `CHANGELOG.md` (dev via pnpm-workspace.yaml walk)
 * 4. `process.cwd()/CHANGELOG.md` (last resort)
 *
 * Returns `null` if none of the candidates exist.
 */
function resolveChangelogPath(): string | null {
  if (resolvedChangelogPath !== undefined) return resolvedChangelogPath;

  const candidates: string[] = [
    resolve(__dirname, '../CHANGELOG.md'),
    resolve(__dirname, '../../CHANGELOG.md'),
  ];

  const workspaceRoot = findWorkspaceRoot(__dirname);
  if (workspaceRoot) candidates.push(resolve(workspaceRoot, 'CHANGELOG.md'));
  candidates.push(resolve(process.cwd(), 'CHANGELOG.md'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      resolvedChangelogPath = candidate;
      return candidate;
    }
  }

  resolvedChangelogPath = null;
  return null;
}

/**
 * Returns the full content of `CHANGELOG.md` together with the currently
 * running daemon version so the frontend can render release notes without a
 * separate `meta:getVersionInfo` call.
 *
 * Falls back gracefully: if the file cannot be located, `markdown` is an
 * empty string.
 */
async function getChangelog(): Promise<GetChangelogResult> {
  const info = await getVersionInfo();
  const path = resolveChangelogPath();
  if (!path) {
    return { markdown: '', version: info.current };
  }
  try {
    const markdown = readFileSync(path, 'utf8');
    return { markdown, version: info.current };
  } catch {
    return { markdown: '', version: info.current };
  }
}

/**
 * Registers the `meta:*` IPC channels.
 *
 * Channels:
 * - `meta:getVersionInfo` — returns current installed version + latest npm version (optional `force` bypasses cache)
 * - `meta:getChangelog` — returns full CHANGELOG.md content + current version
 */
export const metaHandlers: HandlerRegistry = {
  'meta:getVersionInfo': createTypedHandler((options?: { force?: boolean }) =>
    getVersionInfo({ force: Boolean(options?.force) }),
  ),
  'meta:getChangelog': createTypedHandler(() => getChangelog()),
};
