import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHandlerRegistry } from './handlers/index.js';
import { eventBus } from './event-bus.js';
import { restoreOrCleanupTempWorkdirs } from '../services/fix-runner.js';
import { restoreOrCleanupAuditWorkdirs } from '../services/audit-runner.js';
import { cleanupEvalArtifacts } from '../services/eval-artifact-cleanup.js';
import { syncBundledSkills } from '../services/bundled-skills-sync.js';
import { sweepOrphanNakirosProjectEntries, sweepOrphanSandboxes } from '../services/runner-core/index.js';
import { initProposalEngine } from '../services/proposal-engine/index.js';
import { getDb } from '../services/nakiros-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DaemonServerOptions {
  host?: string;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Directory containing the built frontend (index.html + assets/). */
  frontendDir?: string;
}

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Nakiros</title></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0e1116; color: #e2e8f0;">
  <h1>Nakiros daemon is running.</h1>
  <p>No frontend bundle found. Build it with:</p>
  <pre style="background: #1a1f26; padding: 1rem; border-radius: 8px;">pnpm -F @nakiros/desktop build</pre>
  <p>Then reload this page.</p>
</body>
</html>`;

function findFrontendDir(override?: string): string | null {
  if (override && existsSync(override)) return override;
  const candidates = [
    // Prod (packaged npm install): dist/daemon/ → dist/ui
    resolve(__dirname, '../ui'),
    // Dev (tsx): apps/nakiros/src/daemon/ → apps/frontend/dist
    resolve(__dirname, '../../../frontend/dist'),
    // Monorepo root fallback
    resolve(process.cwd(), 'apps/frontend/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'index.html'))) return dir;
  }
  return null;
}

/**
 * One-shot runtime initialization called at daemon boot.
 * - Syncs bundled skills from the ROM to ~/.nakiros/skills/ (+ symlinks them
 *   under ~/.claude/skills/) so runners can resolve them.
 * - Rehydrates in-flight fix/create runs from `~/.nakiros/tmp-skills/` or cleans
 *   up orphan temp workdirs.
 * - Sweeps stray `nakiros-eval-*` skills produced by previous eval sessions.
 * Safe to call multiple times.
 */
export function bootstrapDaemonRuntime(): void {
  // Warm up the shared SQLite database — applies pending migrations so the
  // first SQL-backed service (proposal engine today, config audit tomorrow)
  // doesn't pay the migration cost on a hot path.
  try {
    getDb();
  } catch (err) {
    console.warn('[nakiros] Database init failed:', err instanceof Error ? err.message : err);
  }

  try {
    syncBundledSkills();
  } catch (err) {
    // Non-fatal: the daemon still serves the UI; bundled-skills calls will fail
    // until the user re-runs onboarding. Surface the error for debugging.
    console.warn('[nakiros] syncBundledSkills failed:', err instanceof Error ? err.message : err);
  }
  restoreOrCleanupTempWorkdirs();
  restoreOrCleanupAuditWorkdirs();
  cleanupEvalArtifacts();
  // Reclaim `~/.claude/projects/*` entries left behind by previous runs whose
  // workdir has since been deleted. Only targets Nakiros-named orphans, never
  // user-created projects.
  const sweep = sweepOrphanNakirosProjectEntries();
  if (sweep.deleted > 0) {
    console.log(`[nakiros] Swept ${sweep.deleted} orphan Claude project entr${sweep.deleted === 1 ? 'y' : 'ies'} (scanned ${sweep.scanned}).`);
  }
  // Worktrees from a previous (crashed) session leave directories under
  // ~/.nakiros/sandboxes/ and stale entries in the source repo's worktree
  // list. Boot sweep drops all of them.
  const sandboxes = sweepOrphanSandboxes();
  if (sandboxes.deleted > 0) {
    console.log(`[nakiros] Swept ${sandboxes.deleted} orphan eval sandbox${sandboxes.deleted === 1 ? '' : 'es'}.`);
  }
  // Subscribe the proposal engine to analyzer events and drain any pending
  // raw frictions the analyzer left behind.
  initProposalEngine();
}

export async function createDaemonServer(opts: DaemonServerOptions = {}): Promise<FastifyInstance> {
  // Default to 'warn' so routine request logs stay out of the terminal; the
  // user can still opt in to verbose logs by passing `logLevel: 'info'` or
  // setting the CLI flag.
  const app = Fastify({ logger: { level: opts.logLevel ?? 'warn' } });

  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // ── IPC dispatcher ──────────────────────────────────────────────────────────
  const handlers = buildHandlerRegistry();

  app.post<{ Params: { channel: string }; Body: { args?: unknown[] } }>(
    '/ipc/:channel',
    async (request, reply) => {
      const channel = request.params.channel;
      const handler = (handlers as Record<string, unknown>)[channel];
      if (typeof handler !== 'function') {
        reply.status(404);
        return { error: `Unknown IPC channel: ${channel}` };
      }
      try {
        const args = Array.isArray(request.body?.args) ? request.body.args : [];
        const result = await (handler as (args: unknown[]) => unknown)(args);
        return { ok: true, result };
      } catch (err) {
        reply.status(500);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // ── WebSocket ───────────────────────────────────────────────────────────────
  await app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket) => {
      const unsubscribe = eventBus.onBroadcast((msg) => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify(msg));
      });

      socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
      socket.on('message', (raw: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (typeof msg !== 'object' || msg === null) return;
        const m = msg as { type?: unknown };
        if (m.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      });
      socket.on('close', unsubscribe);
    });
  });

  // ── Static frontend or placeholder ──────────────────────────────────────────
  const frontendDir = findFrontendDir(opts.frontendDir);
  if (frontendDir) {
    await app.register(fastifyStatic, { root: frontendDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/ipc/') || req.url.startsWith('/health') || req.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'Not Found' });
        return;
      }
      // SPA fallback: serve index.html for client-side routing
      reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.get('/', async (_req, reply) => {
      reply.type('text/html').send(PLACEHOLDER_HTML);
    });
  }

  return app;
}
