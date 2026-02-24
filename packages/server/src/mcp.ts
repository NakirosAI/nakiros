import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";

import type { StoredWorkspace } from "@tiqora/shared";

import { registerWorkspaceTools } from "./tools/workspace.js";

export async function handleMcpRequest(
  req: Request,
  res: Response,
  workspace: StoredWorkspace
): Promise<void> {
  const server = new McpServer({
    name: "tiqora",
    version: "0.0.1"
  });

  registerWorkspaceTools(server, workspace);

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
