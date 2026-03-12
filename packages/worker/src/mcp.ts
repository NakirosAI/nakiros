import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import type { IStorage } from './storage.js';
import type { StoredWorkspace } from './types.js';
import { registerWorkspaceTools } from './tools.js';

/**
 * Handles an MCP request for a given workspace.
 * Stateless — a fresh server + transport is created per request.
 * Uses the MCP SDK's Web Standards transport (Fetch API, Cloudflare Workers compatible).
 */
export async function handleMcpRequest(
  request: Request,
  workspace: StoredWorkspace,
  storage: IStorage,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode — no session tracking
    enableJsonResponse: true,      // JSON responses instead of SSE (simpler for stateless)
  });

  const server = new McpServer({ name: 'nakiros', version: '0.0.1' });
  registerWorkspaceTools(server, workspace, storage);

  await server.connect(transport);
  return transport.handleRequest(request);
}
