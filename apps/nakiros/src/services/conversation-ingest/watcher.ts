import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

import { getIngestQueueDir } from './paths.js';
import { drainQueue } from './runner.js';

/**
 * Boot-time + live ingest queue handler. We use chokidar to watch the
 * `~/.nakiros/ingest/queue/` directory and trigger {@link drainQueue} every
 * time a new file lands (the hook script writes one file per Stop event).
 * The watcher is **idempotent + lazily started** — the first call to
 * `startWatcher()` after enabling ingest spins it up, and `stopWatcher()`
 * tears it down on disable. Multiple `start` calls are no-ops.
 *
 * We also drain on start so any queue files left from a previous daemon
 * shutdown (or written before opt-in) are picked up immediately.
 */

let watcher: FSWatcher | null = null;
let drainScheduled = false;

function scheduleDrain(): void {
  // Coalesce rapid-fire `add` events (multiple Stop hooks within the same
  // tick) into a single drain pass.
  if (drainScheduled) return;
  drainScheduled = true;
  setTimeout(() => {
    drainScheduled = false;
    try {
      drainQueue();
    } catch (err) {
      console.warn('[nakiros][ingest] drainQueue failed:', err instanceof Error ? err.message : err);
    }
  }, 250);
}

export function startWatcher(): void {
  if (watcher) return;
  const dir = getIngestQueueDir();
  watcher = chokidar.watch(dir, {
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    depth: 0,
  });
  watcher.on('add', () => scheduleDrain());
  watcher.on('error', (err) => {
    console.warn('[nakiros][ingest] watcher error:', err instanceof Error ? err.message : err);
  });
  // Initial sweep — `ignoreInitial: false` already fires `add` for existing
  // files, but we trigger an explicit drain too in case the directory is
  // empty (no `add` event but we still want a clean broadcast).
  scheduleDrain();
}

export function stopWatcher(): void {
  if (!watcher) return;
  void watcher.close();
  watcher = null;
}

export function isWatcherRunning(): boolean {
  return watcher !== null;
}
