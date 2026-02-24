import type { Server } from "node:http";

import { createHttpServer } from "./http-server.js";

export { readWorkspace, readWorkspaces } from "./storage.js";
export { resolveWorkspaceId } from "./workspace-resolver.js";

let httpServer: Server | null = null;

export async function startServer(port = 3737): Promise<void> {
  const app = createHttpServer();
  return new Promise((resolve, reject) => {
    httpServer = app.listen(port, () => {
      resolve();
    });
    httpServer.on("error", reject);
  });
}

export function stopServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

export function isServerRunning(): boolean {
  return httpServer !== null;
}
