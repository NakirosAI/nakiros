import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, platform, arch } from 'os';
import { join } from 'path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { installAgentsGlobally } from './agent-installer.js';

const BASE_URL = 'https://updates.nakiros.com';
const GLOBAL_DIR = join(homedir(), '.nakiros');
const VERSION_FILE = join(GLOBAL_DIR, 'version.json');
const APP_SUPPORTED_FEATURES: string[] = [];

const API_KEYS: Record<string, string> = {
  stable: process.env.NAKIROS_API_KEY_STABLE ?? '',
  beta: process.env.NAKIROS_API_KEY_BETA ?? '',
};

console.log('[update-checker] ENV check:');
console.log(`  NAKIROS_API_KEY_STABLE = ${API_KEYS.stable ? `"${API_KEYS.stable.slice(0, 8)}…" (${API_KEYS.stable.length} chars)` : '(empty — vérifier .env et define dans electron.vite.config.ts)'}`);
console.log(`  NAKIROS_API_KEY_BETA   = ${API_KEYS.beta ? `"${API_KEYS.beta.slice(0, 8)}…" (${API_KEYS.beta.length} chars)` : '(empty)'}`);

interface BundleManifestFile {
  type: 'agent' | 'workflow' | 'command' | 'core';
  name: string;
  filename: string;
  path: string;
  hash: string;
}

interface BundleManifest {
  version: string;
  channel: string;
  released_at: string;
  min_app_version: string;
  required_features: string[];
  changelog: string;
  compatible: boolean;
  reason?: string;
  message?: string;
  files: BundleManifestFile[];
}

export interface BundleVersionInfo {
  bundle_version: string;
  channel: string;
  app_version: string;
  last_check: string;
  installed_at: string;
  files: Record<string, string>; // path → "sha256:..."
}

export interface UpdateManifestFile {
  type: 'agent' | 'workflow' | 'command' | 'core';
  name: string;
  filename: string;
  path: string;
  hash: string;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  compatible: boolean;
  networkError?: boolean;
  incompatibleReason?: string;
  incompatibleMessage?: string;
  latestVersion: string;
  changelog: string;
  channel: string;
  changedFiles: UpdateManifestFile[];
}

// ─── Local version file ───────────────────────────────────────────────────────

export function getVersionInfo(): BundleVersionInfo | null {
  if (!existsSync(VERSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VERSION_FILE, 'utf-8')) as BundleVersionInfo;
  } catch {
    return null;
  }
}

function writeVersionInfo(info: BundleVersionInfo): void {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(VERSION_FILE, JSON.stringify(info, null, 2) + '\n', 'utf-8');
}

function shouldCheck(local: BundleVersionInfo | null): boolean {
  if (!local) return true;
  const last = new Date(local.last_check).getTime();
  return Date.now() - last > 24 * 60 * 60 * 1000;
}

// ─── Check for updates ────────────────────────────────────────────────────────

export async function checkForUpdates(
  force = false,
  channel: 'stable' | 'beta' = 'stable',
): Promise<UpdateCheckResult> {
  const noUpdate: UpdateCheckResult = {
    hasUpdate: false,
    compatible: true,
    latestVersion: '',
    changelog: '',
    channel,
    changedFiles: [],
  };

  const local = getVersionInfo();
  if (!force && !shouldCheck(local)) return noUpdate;

  const appVersion = app.getVersion();
  const ua = `Nakiros/${appVersion} (${platform()}; ${arch()})`;
  const apiKey = API_KEYS[channel] ?? '';

  const featuresParam = APP_SUPPORTED_FEATURES.length > 0
    ? `&features=${APP_SUPPORTED_FEATURES.join(',')}`
    : '';
  const url = `${BASE_URL}/manifest?channel=${channel}&app_version=${encodeURIComponent(appVersion)}${featuresParam}`;
  console.log(`[update-checker] GET ${url}`);
  console.log(`[update-checker] Headers: User-Agent=${ua} | X-Nakiros-Key=${apiKey ? `${apiKey.slice(0, 8)}…` : '(empty)'}`);

  let manifest: BundleManifest;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'X-Nakiros-Key': apiKey,
        'User-Agent': ua,
      },
    });
    console.log(`[update-checker] Response: HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[update-checker] Error body: ${body}`);
      throw new Error(`HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }
    manifest = (await res.json()) as BundleManifest;
    console.log(`[update-checker] Manifest OK — version=${manifest.version} channel=${manifest.channel} compatible=${manifest.compatible ?? '(not set)'} files=${manifest.files?.length ?? 'n/a'}`);
  } catch (err) {
    console.warn('[update-checker] Manifest fetch failed:', (err as Error).message);
    return { ...noUpdate, networkError: true };
  }

  // Update last_check regardless
  if (local) {
    writeVersionInfo({ ...local, last_check: new Date().toISOString() });
  }

  // Handle incompatible bundle
  if (manifest.compatible === false) {
    return {
      hasUpdate: false,
      compatible: false,
      incompatibleReason: manifest.reason,
      incompatibleMessage: manifest.message,
      latestVersion: manifest.version,
      changelog: manifest.changelog ?? '',
      channel,
      changedFiles: [],
    };
  }

  // Compare hashes — si !local (premier install), tous les fichiers sont "changed"
  const changedFiles: UpdateManifestFile[] = (manifest.files ?? [])
    .filter((f) => !local?.files?.[f.path] || local.files[f.path] !== f.hash)
    .map((f) => ({
      type: f.type,
      name: f.name,
      filename: f.filename,
      path: f.path,
      hash: f.hash,
      downloadUrl: `${BASE_URL}/download/${manifest.version}/${f.path}?channel=${channel}`,
    }));

  return {
    hasUpdate: changedFiles.length > 0,
    compatible: true,
    latestVersion: manifest.version,
    changelog: manifest.changelog ?? '',
    channel,
    changedFiles,
  };
}

// ─── Apply update ─────────────────────────────────────────────────────────────

export async function applyUpdate(
  files: UpdateManifestFile[],
  bundleVersion: string,
  win: BrowserWindow,
  onFileProgress?: (filename: string, done: boolean, error?: string) => void,
): Promise<void> {
  const local = getVersionInfo();
  const channel = local?.channel ?? 'stable';
  const apiKey = API_KEYS[channel] ?? '';
  const appVersion = app.getVersion();
  const ua = `Nakiros/${appVersion} (${platform()}; ${arch()})`;

  const updatedHashes: Record<string, string> = {};

  for (const file of files) {
    const targetPath = join(GLOBAL_DIR, file.path);
    const targetDir = join(targetPath, '..');

    try {
      const res = await fetch(file.downloadUrl, {
        signal: AbortSignal.timeout(30000),
        headers: {
          'X-Nakiros-Key': apiKey,
          'User-Agent': ua,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      // Verify SHA256
      const expectedHash = file.hash.replace(/^sha256:/, '');
      const actualHash = createHash('sha256').update(buffer).digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`Hash mismatch for ${file.filename}`);
      }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, buffer);
      updatedHashes[file.path] = file.hash;

      win.webContents.send('updates:progress', { file: file.filename, done: true });
      onFileProgress?.(file.filename, true);
    } catch (err) {
      const errorMsg = (err as Error).message;
      win.webContents.send('updates:progress', { file: file.filename, done: false, error: errorMsg });
      onFileProgress?.(file.filename, false, errorMsg);
    }
  }

  // Re-deploy commands to all installed AI editors
  try {
    installAgentsGlobally();
  } catch {
    // Non-blocking
  }

  // Update version.json
  if (Object.keys(updatedHashes).length > 0) {
    const now = new Date().toISOString();
    writeVersionInfo({
      bundle_version: bundleVersion,
      channel: local?.channel ?? 'stable',
      app_version: appVersion,
      last_check: now,
      installed_at: now,
      files: { ...(local?.files ?? {}), ...updatedHashes },
    });
  }
}
