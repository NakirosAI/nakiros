import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";

import type { StoredWorkspace } from "@nakiros/shared";

import type { IStorage } from "./storage.js";
import { registerWorkspaceTools } from "./tools/workspace.js";

export async function handleMcpRequest(
  req: Request,
  res: Response,
  workspace: StoredWorkspace,
  storage: IStorage
): Promise<void> {
  const server = new McpServer({
    name: "nakiros",
    version: "0.0.1"
  });

  registerWorkspaceTools(server, workspace, storage);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body as Record<string, unknown>);
}
