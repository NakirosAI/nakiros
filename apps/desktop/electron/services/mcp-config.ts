import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

interface McpServerEntry {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

interface ClaudeMcpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export function buildNakirosMcpServerEntry(
  workspaceId: string,
  mcpServerUrl: string,
  authToken?: string | null,
): McpServerEntry {
  return {
    type: 'http',
    url: `${mcpServerUrl}/ws/${workspaceId}/mcp`,
    ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
  };
}

export function upsertNakirosMcpConfig(
  configPath: string,
  workspaceId: string,
  mcpServerUrl: string,
  authToken?: string | null,
): void {
  let existing: ClaudeMcpConfig = {};

  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8')) as ClaudeMcpConfig;
    } catch {
      existing = {};
    }
  }

  const nextServers = {
    ...(existing.mcpServers ?? {}),
    nakiros: buildNakirosMcpServerEntry(workspaceId, mcpServerUrl, authToken),
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({ ...existing, mcpServers: nextServers }, null, 2) + '\n',
    'utf-8',
  );
}
