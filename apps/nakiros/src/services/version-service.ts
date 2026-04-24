import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'node:url';
import type { VersionInfo } from '@nakiros/shared';

const PACKAGE_NAME = '@nakirosai/nakiros';
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FETCH_TIMEOUT_MS = 4000;

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CacheEntry {
  latest: string;
  checkedAt: string;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<CacheEntry | null> | null = null;

function readCurrentVersion(): string {
  const candidates = [
    resolve(__dirname, '../../package.json'),
    resolve(process.cwd(), 'apps/nakiros/package.json'),
  ];
  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return 'unknown';
}

function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Simple semver compare ignoring prereleases and build metadata. Returns:
 *  1 when `a > b`, -1 when `a < b`, 0 when equal or unparseable.
 */
function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function fetchLatestFromNpm(): Promise<CacheEntry | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: string };
    if (!body.version) return null;
    const entry: CacheEntry = {
      latest: body.version,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    cache = entry;
    return entry;
  } catch {
    return null;
  }
}

async function getLatestVersion({ force }: { force: boolean }): Promise<CacheEntry | null> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache;
  if (inFlight) return inFlight;
  inFlight = fetchLatestFromNpm().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Build the `VersionInfo` payload surfaced by `meta:getVersionInfo`. Current
 * version comes from the daemon's own `package.json`; latest is fetched from
 * the npm registry (cached 6h, 4s timeout). `updateAvailable` uses a simple
 * semver major.minor.patch compare ignoring prereleases.
 *
 * @param options.force - bypass the 6h cache and hit npm again
 */
export async function getVersionInfo(options?: { force?: boolean }): Promise<VersionInfo> {
  const current = readCurrentVersion();
  const remote = await getLatestVersion({ force: options?.force === true });
  const latest = remote?.latest ?? cache?.latest ?? null;
  const checkedAt = remote?.checkedAt ?? cache?.checkedAt ?? null;
  return {
    current,
    latest,
    updateAvailable: latest != null && compareVersions(latest, current) > 0,
    packageName: PACKAGE_NAME,
    checkedAt,
  };
}
