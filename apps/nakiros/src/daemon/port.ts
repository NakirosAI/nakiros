import { createServer } from 'node:net';

export const DEFAULT_PORT = 4242;

export async function findFreePort(start: number, maxTries = 20): Promise<number> {
  for (let port = start; port < start + maxTries; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port in range ${start}-${start + maxTries}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}
