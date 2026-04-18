import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHandlerRegistry } from './handlers/index.js';
import { eventBus } from './event-bus.js';
import { restoreOrCleanupTempWorkdirs } from '../services/fix-runner.js';
import { cleanupEvalArtifacts } from '../services/eval-artifact-cleanup.js';

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
    resolve(__dirname, '../../../../apps/desktop/dist-electron/renderer'),
    resolve(__dirname, '../../../apps/desktop/dist-electron/renderer'),
    resolve(process.cwd(), 'apps/desktop/dist-electron/renderer'),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'index.html'))) return dir;
  }
  return null;
}

/**
 * One-shot runtime initialization called at daemon boot.
 * - Rehydrates in-flight fix/create runs from `~/.nakiros/tmp-skills/` or cleans
 *   up orphan temp workdirs.
 * - Sweeps stray `nakiros-eval-*` skills produced by previous eval sessions.
 * Safe to call multiple times.
 */
export function bootstrapDaemonRuntime(): void {
  restoreOrCleanupTempWorkdirs();
  cleanupEvalArtifacts();
}

export async function createDaemonServer(opts: DaemonServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: opts.logLevel ?? 'info' } });

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
