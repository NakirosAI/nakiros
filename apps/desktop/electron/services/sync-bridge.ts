import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { buildEnv } from '@nakiros/orchestrator';
import type { StoredWorkspace } from '@nakiros/shared';

// ─── Binary resolution (mirrors agent-runner-bridge) ─────────────────────────

function resolveNakirosBin(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'nakiros');
  }
  const workspaceRoot = join(__dirname, '../../../../..');
  const devBin = join(workspaceRoot, 'node_modules', '.bin', 'nakiros');
  if (existsSync(devBin)) return devBin;
  return 'nakiros';
}

// ─── Active sync processes (one per workspace) ────────────────────────────────

type SyncProcess = ReturnType<typeof spawn>;
const syncProcesses = new Map<string, SyncProcess>();

export type SyncBridgeEvent =
  | { type: 'sync:started'; workspace: string; watchPath: string; pid: number }
  | { type: 'sync:pushed'; artifactPath: string; status: 'ok' | 'error'; statusCode: number }
  | { type: 'sync:reconcile-done'; workspace: string; pushed: number; skipped: number }
  | { type: 'sync:stopped'; workspace: string }
  | { type: 'sync:error'; message: string };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spawn `nakiros sync start` for a workspace in foreground mode.
 * The process stays alive as a file watcher and emits NDJSON events on stdout.
 * Idempotent: calling again for the same workspaceId is a no-op if already running.
 */
export function startWorkspaceSyncBridge(
  workspace: StoredWorkspace,
  onEvent: (event: SyncBridgeEvent) => void,
): void {
  if (syncProcesses.has(workspace.id)) {
    console.log(`[sync-bridge] Watcher already running for workspace "${workspace.name}"`);
    return;
  }

  const nakirosBin = resolveNakirosBin();
  const args = [
    'sync', 'start',
    '--workspace-id', workspace.id,
    '--workspace-name', workspace.name,
  ];

  console.log(`[sync-bridge] Spawning watcher for "${workspace.name}" — ${nakirosBin} ${args.join(' ')}`);

  let child: SyncProcess;
  try {
    child = spawn(nakirosBin, args, {
      env: buildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error(`[sync-bridge] Spawn error for "${workspace.name}": ${String(err)}`);
    onEvent({ type: 'sync:error', message: String(err) });
    return;
  }

  let buffer = '';

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as SyncBridgeEvent;
        console.log(`[sync-bridge] Event from "${workspace.name}":`, event.type);
        onEvent(event);
      } catch {
        // Non-JSON line from process — ignore
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim();
    if (text) process.stderr.write(`[sync-bridge][${workspace.name}] ${text}\n`);
  });

  child.on('close', (code) => {
    syncProcesses.delete(workspace.id);
    console.log(`[sync-bridge] Watcher closed for "${workspace.name}" (code: ${code ?? 0})`);
  });

  child.on('error', (err) => {
    syncProcesses.delete(workspace.id);
    console.error(`[sync-bridge] Process error for "${workspace.name}": ${err.message}`);
    const hint = err.message.includes('ENOENT') || err.message.includes('not found')
      ? 'nakiros CLI not found. Run `pnpm build` in the monorepo root.'
      : err.message;
    onEvent({ type: 'sync:error', message: hint });
  });

  syncProcesses.set(workspace.id, child);
}

/**
 * Send SIGUSR1 to the sync process to trigger an immediate push of all local files.
 * Used when the app comes back online after an offline period.
 */
export function triggerSyncPush(workspaceId: string): void {
  const child = syncProcesses.get(workspaceId);
  if (!child || child.pid == null) return;
  try {
    process.kill(child.pid, 'SIGUSR1');
  } catch {
    // Process may have already exited — ignore
  }
}

export function stopWorkspaceSyncBridge(workspaceId: string): void {
  const child = syncProcesses.get(workspaceId);
  if (child) {
    child.kill('SIGTERM');
    syncProcesses.delete(workspaceId);
    console.log(`[sync-bridge] Stopped watcher for workspace ${workspaceId}`);
  }
}

export function stopAllSyncBridges(): void {
  for (const [workspaceId] of syncProcesses) {
    stopWorkspaceSyncBridge(workspaceId);
  }
}
