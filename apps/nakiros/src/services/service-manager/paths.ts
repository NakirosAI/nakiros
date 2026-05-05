import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Patterns that identify a transient npx / Corepack cache path.
 * The daemon binary must NOT be registered as a service when running from
 * these locations — the cache entry will be evicted without notice.
 */
const NPX_CACHE_PATTERNS: RegExp[] = [
  /\.npm[/\\]_npx[/\\]/,
  /Library[/\\]Caches[/\\]_npx[/\\]/,
  /Library[/\\]Caches[/\\]npm[/\\]/,
  /\.cache[/\\]npx[/\\]/,
];

/**
 * Resolve and real-path the daemon binary entry point.
 *
 * The caller (bin/nakiros.ts) must pass its own `import.meta.url` so that we
 * resolve the path of the actual bin entry file, not this helper module.
 *
 * @param binImportMetaUrl - `import.meta.url` from `bin/nakiros.ts`
 * @returns the canonicalized absolute path to the bin entry JS file
 */
export function resolveBinPath(binImportMetaUrl: string): string {
  const raw = fileURLToPath(binImportMetaUrl);
  try {
    return realpathSync(raw);
  } catch {
    // realpathSync can fail on a broken symlink — fall back to the raw path.
    return raw;
  }
}

/**
 * Determine whether `binPath` is located inside a transient npx or npm cache
 * directory. When true, `nakiros service install` should refuse to register
 * the service because the cache entry may be evicted without notice.
 */
export function isNpxCachePath(binPath: string): boolean {
  const home = homedir();
  const normalized = binPath.replace(home, '~');
  return NPX_CACHE_PATTERNS.some((re) => re.test(normalized) || re.test(binPath));
}

/**
 * Return the Node.js executable that should be used to start the service.
 *
 * We use `process.execPath` (the Node binary currently running) so the service
 * always starts with the same Node version that installed Nakiros.
 */
export function resolveNodeExecutable(): string {
  return process.execPath;
}

/**
 * Return `$HOME` — the working directory for the Nakiros daemon service.
 * Using $HOME ensures relative paths inside the daemon resolve predictably
 * regardless of how the service manager starts the process.
 */
export function serviceWorkingDirectory(): string {
  return homedir();
}
