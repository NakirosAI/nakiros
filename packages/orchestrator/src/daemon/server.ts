import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';

export interface DaemonServerOptions {
  host?: string;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

export async function createDaemonServer(opts: DaemonServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: opts.logLevel ?? 'info' },
  });

  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
  }));

  await app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket) => {
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
    });
  });

  return app;
}
