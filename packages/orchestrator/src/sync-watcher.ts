import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, relative } from 'path';
import chokidar from 'chokidar';
import { getAccessToken } from './credentials.js';
import type { StoredWorkspace } from '@nakiros/shared';

const DEBOUNCE_MS = 2000;
const SYNC_DIR = join(homedir(), '.nakiros', 'sync');

// ─── PID / log files ──────────────────────────────────────────────────────────

function pidPath(slug: string): string { return join(SYNC_DIR, `${slug}.pid`); }
function logPath(slug: string): string { return join(SYNC_DIR, `${slug}.log`); }
function statePath(slug: string): string { return join(SYNC_DIR, `${slug}.state.json`); }

function writePid(slug: string): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(pidPath(slug), String(process.pid), 'utf-8');
}

function removePid(slug: string): void {
  try { if (existsSync(pidPath(slug))) unlinkSync(pidPath(slug)); } catch { /* best effort */ }
}

function appendLog(slug: string, line: string): void {
  try {
    mkdirSync(SYNC_DIR, { recursive: true });
    const p = logPath(slug);
    const existing = existsSync(p) ? readFileSync(p, 'utf-8').split('\n') : [];
    const next = [...existing, line].slice(-100).join('\n');
    writeFileSync(p, next, 'utf-8');
  } catch { /* best effort */ }
}

// ─── Sync state (hash-based change detection) ─────────────────────────────────
//
// State file: ~/.nakiros/sync/{slug}.state.json
// Shape: { [artifactPath]: { hash: string, version: number } }
//
// A file is only pushed when its SHA-256 hash differs from the stored hash.
// This prevents duplicate versions on every app restart.

interface ArtifactSyncEntry {
  hash: string;
  version: number;
}

type SyncState = Record<string, ArtifactSyncEntry>;

function readSyncState(slug: string): SyncState {
  try {
    const p = statePath(slug);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf-8')) as SyncState;
  } catch {
    return {};
  }
}

function writeSyncState(slug: string, state: SyncState): void {
  try {
    mkdirSync(SYNC_DIR, { recursive: true });
    writeFileSync(statePath(slug), JSON.stringify(state), 'utf-8');
  } catch { /* best effort */ }
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Mark a file as already synced at a given version (e.g. after a pull from R2).
 * Prevents the watcher from pushing files that were just downloaded.
 * Can be called from any process that writes to the context dir.
 */
export function markArtifactSynced(slug: string, artifactPath: string, content: string, version: number): void {
  const state = readSyncState(slug);
  state[artifactPath] = { hash: hashContent(content), version };
  writeSyncState(slug, state);
}

// ─── Push single artifact ─────────────────────────────────────────────────────

async function pushArtifact(workspace: StoredWorkspace, slug: string, absolutePath: string): Promise<void> {
  const contextDir = join(homedir(), '.nakiros', 'workspaces', slug, 'context');
  const rel = relative(contextDir, absolutePath);
  if (!rel || rel.startsWith('..')) return;

  const artifactPath = rel.replace(/\.md$/i, '').replace(/\\/g, '/');
  let content: string;
  try { content = readFileSync(absolutePath, 'utf-8'); } catch { return; }

  // ── Hash check: skip if content hasn't changed since last push ─────────────
  const hash = hashContent(content);
  const state = readSyncState(slug);
  if (state[artifactPath]?.hash === hash) {
    appendLog(slug, `${new Date().toISOString()} skipped ${artifactPath} (unchanged)`);
    return;
  }

  const auth = await getAccessToken();
  if (!auth) return;

  const response = await fetch(
    `${auth.apiUrl}/ws/${workspace.id}/artifacts/${encodeURIComponent(artifactPath)}/versions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactPath, artifactType: 'prd', content, author: auth.email ?? null }),
    },
  );

  const entry = `${new Date().toISOString()} ${response.ok ? 'pushed' : 'failed'} ${artifactPath} (${response.status})`;
  appendLog(slug, entry);

  if (response.ok) {
    // Update state so next push of the same content is skipped
    const row = (await response.json().catch(() => ({}))) as { version?: number };
    state[artifactPath] = { hash, version: row.version ?? (state[artifactPath]?.version ?? 0) + 1 };
    writeSyncState(slug, state);
  }

  process.stdout.write(JSON.stringify({ type: 'sync:pushed', artifactPath, status: response.ok ? 'ok' : 'error', statusCode: response.status }) + '\n');
}

// ─── Active watchers ──────────────────────────────────────────────────────────

const activeWatchers = new Map<string, ReturnType<typeof chokidar.watch>>();
const pendingDebounce = new Map<string, NodeJS.Timeout>();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startSyncWatcher(workspace: StoredWorkspace, slug: string): Promise<void> {
  const watchPath = join(homedir(), '.nakiros', 'workspaces', slug, 'context');
  mkdirSync(watchPath, { recursive: true });
  writePid(slug);

  const watcher = chokidar.watch(`${watchPath}/**/*.md`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', (path) => scheduleSync(workspace, slug, path));
  watcher.on('change', (path) => scheduleSync(workspace, slug, path));

  activeWatchers.set(slug, watcher);

  process.stdout.write(JSON.stringify({ type: 'sync:started', workspace: slug, watchPath, pid: process.pid }) + '\n');

  // Initial reconciliation: push only files whose hash has changed
  pushAllArtifacts(workspace, slug).catch((err: unknown) =>
    process.stderr.write(`[sync] Initial push failed: ${String(err)}\n`),
  );

  process.on('SIGTERM', () => { stopSyncWatcher(slug); process.exit(0); });
  process.on('SIGINT', () => { stopSyncWatcher(slug); process.exit(0); });
  process.on('SIGUSR1', () => {
    process.stdout.write(JSON.stringify({ type: 'sync:push-requested', workspace: slug }) + '\n');
    pushAllArtifacts(workspace, slug).catch((err: unknown) =>
      process.stderr.write(`[sync] On-demand push failed: ${String(err)}\n`),
    );
  });
}

function scheduleSync(workspace: StoredWorkspace, slug: string, path: string): void {
  const existing = pendingDebounce.get(path);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingDebounce.delete(path);
    pushArtifact(workspace, slug, path).catch((err: unknown) =>
      process.stderr.write(`[sync] Push failed for ${path}: ${String(err)}\n`),
    );
  }, DEBOUNCE_MS);
  pendingDebounce.set(path, timer);
}

export function stopSyncWatcher(slug: string): void {
  const watcher = activeWatchers.get(slug);
  if (watcher) {
    watcher.close().catch(() => { /* best effort */ });
    activeWatchers.delete(slug);
  }
  removePid(slug);
  process.stdout.write(JSON.stringify({ type: 'sync:stopped', workspace: slug }) + '\n');
}

export function getSyncStatus(slug: string): { running: boolean; pid: number | null; workspace: string } {
  const p = pidPath(slug);
  if (!existsSync(p)) return { running: false, pid: null, workspace: slug };
  try {
    const pid = parseInt(readFileSync(p, 'utf-8').trim(), 10);
    process.kill(pid, 0);
    return { running: true, pid, workspace: slug };
  } catch {
    removePid(slug);
    return { running: false, pid: null, workspace: slug };
  }
}

export async function pushAllArtifacts(workspace: StoredWorkspace, slug: string, fileOverride?: string): Promise<void> {
  const contextDir = join(homedir(), '.nakiros', 'workspaces', slug, 'context');
  if (!existsSync(contextDir)) {
    process.stderr.write(`[nakiros] No local context found at ${contextDir}\n`);
    process.stdout.write(JSON.stringify({ type: 'sync:reconcile-done', workspace: slug, pushed: 0, skipped: 0 }) + '\n');
    return;
  }

  const collectMd = (dir: string): string[] => {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return collectMd(full);
      if (e.isFile() && e.name.endsWith('.md')) return [full];
      return [];
    });
  };

  const files = fileOverride
    ? [join(contextDir, `${fileOverride}.md`)]
    : collectMd(contextDir);

  let pushed = 0;
  let skipped = 0;

  // Count before — read state once to detect skips
  const stateBefore = readSyncState(slug);

  for (const file of files) {
    if (!existsSync(file)) continue;

    // Check hash without pushing (to count skips accurately)
    const rel = relative(contextDir, file);
    const artifactPath = rel.replace(/\.md$/i, '').replace(/\\/g, '/');
    let content: string;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }
    const hash = hashContent(content);

    if (stateBefore[artifactPath]?.hash === hash) {
      skipped++;
    } else {
      await pushArtifact(workspace, slug, file);
      pushed++;
    }
  }

  process.stdout.write(JSON.stringify({ type: 'sync:reconcile-done', workspace: slug, pushed, skipped }) + '\n');
}
