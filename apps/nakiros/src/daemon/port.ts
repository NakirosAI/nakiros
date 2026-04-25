import { createServer } from 'node:net';

/** Default TCP port the Nakiros daemon listens on (`http://localhost:4242`). */
export const DEFAULT_PORT = 4242;

/**
 * Probe ports starting from `start` and return the first one not in use.
 * Used when the default port is taken so the daemon can still boot.
 *
 * @param start - first port to probe (inclusive)
 * @param maxTries - how many consecutive ports to try before giving up
 * @returns the first free port in `[start, start + maxTries)`
 * @throws {Error} when every port in the range is in use
 */
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
