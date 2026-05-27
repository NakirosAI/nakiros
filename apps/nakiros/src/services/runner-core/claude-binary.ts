import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Module-level cache — shell spawn happens at most once per process lifetime.
// ---------------------------------------------------------------------------

/** `undefined` = not yet resolved; `null` = resolution failed; `string` = PATH value. */
let cachedShellPath: string | null | undefined;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Spawn the user's login shell and extract its PATH value using a sentinel
 * marker. Uses `-lic` (login + interactive) so that rc files that define PATH
 * only in interactive mode (e.g. `.zshrc`) are sourced.
 *
 * The sentinel `__NAKIROS_PATH__:$PATH` lets us isolate the correct line even
 * when rc files print noise (motd, banners, etc.).
 *
 * Result is cached for the process lifetime so the shell is never spawned
 * more than once.
 *
 * @returns The PATH string from the login shell, or `null` on failure.
 */
function resolveLoginShellPath(): string | null {
  if (cachedShellPath !== undefined) return cachedShellPath;

  const shell = process.env.SHELL ?? (process.platform === 'linux' ? '/bin/bash' : '/bin/zsh');
  const marker = '__NAKIROS_PATH__';

  try {
    const result = spawnSync(shell, ['-lic', `echo "${marker}:$PATH"`], {
      encoding: 'utf8',
      timeout: 5000,
      // Minimal env so the shell bootstraps cleanly; HOME is required for rc files.
      env: { HOME: homedir(), TERM: 'xterm' },
    });

    if (result.status !== 0 || result.error || !result.stdout) {
      cachedShellPath = null;
      return null;
    }

    const line = result.stdout
      .split('\n')
      .find((l) => l.startsWith(`${marker}:`));

    if (!line) {
      cachedShellPath = null;
      return null;
    }

    const path = line.slice(marker.length + 1).trim();
    cachedShellPath = path || null;
    return cachedShellPath;
  } catch {
    cachedShellPath = null;
    return null;
  }
}

/**
 * Well-known user-level install locations for the `claude` binary.
 * Used only as last-resort fallback when the login shell PATH is unavailable.
 */
function claudeCandidateDirs(): string[] {
  const home = homedir();
  return [
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

/**
 * Walk ~/.nvm/versions/node/<version>/bin entries and return every bin
 * directory that contains a `claude` executable. Returns an empty array when
 * nvm is absent.
 * Used only as last-resort fallback when the login shell PATH is unavailable.
 */
function nvmClaudeDirs(): string[] {
  const nvmVersionsDir = join(homedir(), '.nvm', 'versions', 'node');
  if (!existsSync(nvmVersionsDir)) return [];
  try {
    const result: string[] = [];
    for (const version of readdirSync(nvmVersionsDir)) {
      const binDir = join(nvmVersionsDir, version, 'bin');
      if (existsSync(join(binDir, 'claude'))) result.push(binDir);
    }
    return result;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the `claude` CLI binary.
 *
 * Search order:
 * 1. Each directory in the login-shell PATH (via {@link resolveLoginShellPath}).
 *    This mirrors the VS Code "fix-path" approach and works even when the
 *    daemon is started by launchd / systemd with a minimal PATH.
 * 2. If the login shell is unavailable, fall back to `process.env.PATH`.
 * 3. Last resort: well-known candidate directories (`~/.local/bin`,
 *    `~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) and any
 *    `~/.nvm/versions/node/<version>/bin` directory that contains `claude`.
 * 4. Bare string `'claude'` so that foreground runs (where the shell PATH is
 *    already set correctly) continue to work.
 *
 * @returns Absolute path to the `claude` binary, or `'claude'` as fallback.
 */
export function resolveClaudeBinary(): string {
  // 1 & 2: search PATH dirs (login-shell first, process.env.PATH as fallback)
  const shellPath = resolveLoginShellPath() ?? process.env.PATH;
  if (shellPath) {
    for (const dir of shellPath.split(':')) {
      if (!dir) continue;
      const candidate = join(dir, 'claude');
      if (existsSync(candidate)) return candidate;
    }
  }

  // 3: hard-coded candidate dirs + nvm walk (last resort)
  for (const dir of claudeCandidateDirs()) {
    const candidate = join(dir, 'claude');
    if (existsSync(candidate)) return candidate;
  }
  for (const dir of nvmClaudeDirs()) {
    const candidate = join(dir, 'claude');
    if (existsSync(candidate)) return candidate;
  }

  // 4: bare fallback — works in foreground where the shell PATH is inherited
  return 'claude';
}

/**
 * Build a `ProcessEnv` suitable for spawning the `claude` CLI from within a
 * launchd / systemd service context where the inherited PATH is minimal.
 *
 * PATH construction:
 * 1. Directories from the login-shell PATH (see {@link resolveLoginShellPath}).
 *    If unavailable, falls back to `process.env.PATH`.
 * 2. The parent directory of the current Node.js executable (covers
 *    nvm-managed Node installs, e.g. `~/.nvm/versions/node/<v>/bin`).
 *
 * Hard-coded fallback directories (`/opt/homebrew/bin`, `/usr/local/bin`,
 * etc.) are intentionally omitted — the login shell PATH already contains
 * whatever is relevant for this user's setup.
 *
 * Duplicates are removed while preserving first-occurrence order.
 *
 * @returns A shallow copy of `process.env` with an enriched `PATH`.
 */
export function buildClaudeEnv(): NodeJS.ProcessEnv {
  const loginPath = resolveLoginShellPath() ?? process.env.PATH ?? '';

  const parts: string[] = loginPath.split(':');

  // Ensure the current Node binary's directory is included (idempotent if
  // the login shell already put it on PATH).
  parts.push(dirname(process.execPath));

  // Deduplicate preserving first occurrence; filter empty strings.
  const seen = new Set<string>();
  const enrichedPath: string[] = [];
  for (const p of parts) {
    if (p && !seen.has(p)) {
      seen.add(p);
      enrichedPath.push(p);
    }
  }

  return { ...process.env, PATH: enrichedPath.join(':') };
}

/**
 * Resolve the directory containing the `claude` CLI binary, or `null` when
 * the binary cannot be located.
 *
 * Uses the same PATH resolution as {@link resolveClaudeBinary}: login-shell
 * PATH first, then `process.env.PATH`, then hard-coded candidate directories.
 *
 * @returns Absolute directory path, or `null` if `claude` was not found.
 */
export function resolveClaudeDir(): string | null {
  const shellPath = resolveLoginShellPath() ?? process.env.PATH;
  if (shellPath) {
    for (const dir of shellPath.split(':')) {
      if (!dir) continue;
      if (existsSync(join(dir, 'claude'))) return dir;
    }
  }
  for (const dir of claudeCandidateDirs()) {
    if (existsSync(join(dir, 'claude'))) return dir;
  }
  for (const dir of nvmClaudeDirs()) {
    return dir;
  }
  return null;
}
