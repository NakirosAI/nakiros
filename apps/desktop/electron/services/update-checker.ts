import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { BrowserWindow } from 'electron';

const MANIFEST_URL = 'https://updates.nakiros.com/agents/manifest.json';
const GLOBAL_DIR = join(homedir(), '.nakiros');
const VERSION_FILE = join(GLOBAL_DIR, 'version.json');

export interface ManifestFile {
  type: 'agent' | 'workflow' | 'core';
  name: string;
  filename: string;
  version: string;
  hash: string;
  url: string;
}

export interface UpdateManifest {
  version: string;
  released_at: string;
  changelog: string;
  files: ManifestFile[];
}

export interface LocalVersionInfo {
  nakiros_app: string;
  agents_version: string;
  workflows_version: string;
  last_check: string;
  files: Record<string, { version: string; hash: string }>;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  changelog: string;
  changedFiles: ManifestFile[];
}

function readLocalVersion(): LocalVersionInfo | null {
  if (!existsSync(VERSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VERSION_FILE, 'utf-8')) as LocalVersionInfo;
  } catch {
    return null;
  }
}

function writeLocalVersion(info: LocalVersionInfo): void {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(VERSION_FILE, JSON.stringify(info, null, 2) + '\n', 'utf-8');
}

function shouldCheck(local: LocalVersionInfo | null): boolean {
  if (!local) return true;
  const last = new Date(local.last_check).getTime();
  return Date.now() - last > 24 * 60 * 60 * 1000;
}

export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  const noUpdate: UpdateCheckResult = {
    hasUpdate: false,
    latestVersion: '',
    changelog: '',
    changedFiles: [],
  };

  const local = readLocalVersion();
  if (!force && !shouldCheck(local)) return noUpdate;

  let manifest: UpdateManifest;
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as UpdateManifest;
  } catch {
    // Réseau inaccessible — ne pas bloquer l'app
    return noUpdate;
  }

  // Mettre à jour last_check même sans update
  if (local) {
    writeLocalVersion({ ...local, last_check: new Date().toISOString() });
  }

  if (!local) return noUpdate;

  const changedFiles = manifest.files.filter((f) => {
    const installed = local.files[f.filename];
    return !installed || installed.hash !== f.hash;
  });

  return {
    hasUpdate: changedFiles.length > 0,
    latestVersion: manifest.version,
    changelog: manifest.changelog,
    changedFiles,
  };
}

export async function applyUpdate(
  files: ManifestFile[],
  win: BrowserWindow,
): Promise<void> {
  const local = readLocalVersion();

  for (const file of files) {
    const subdirMap: Record<ManifestFile['type'], string> = {
      agent: 'agents',
      workflow: 'workflows',
      core: 'core',
    };
    const targetDir = join(GLOBAL_DIR, subdirMap[file.type]);
    const targetPath = join(targetDir, file.filename);

    try {
      const res = await fetch(file.url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      // Vérifier le hash sha256
      const expectedHash = file.hash.replace(/^sha256:/, '');
      const actualHash = createHash('sha256').update(buffer).digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`Hash mismatch pour ${file.filename}`);
      }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, buffer);

      win.webContents.send('updates:progress', { file: file.filename, done: true });
    } catch (err) {
      win.webContents.send('updates:progress', {
        file: file.filename,
        done: false,
        error: (err as Error).message,
      });
    }
  }

  // Mettre à jour version.json
  if (local) {
    const updatedFiles = { ...local.files };
    for (const f of files) {
      updatedFiles[f.filename] = { version: f.version, hash: f.hash };
    }
    writeLocalVersion({
      ...local,
      agents_version: files.find((f) => f.type === 'agent')?.version ?? local.agents_version,
      workflows_version: files.find((f) => f.type === 'workflow')?.version ?? local.workflows_version,
      last_check: new Date().toISOString(),
      files: updatedFiles,
    });
  }
}
