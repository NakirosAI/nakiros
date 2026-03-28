import { mkdirSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { upsertNakirosMcpConfig } from './mcp-config.js';
import { syncWorkspaceSymlinks } from './workspace-symlinks.js';

function writeClaudeJson(repoPath: string, workspaceId: string, mcpServerUrl: string): void {
  const claudeDir = join(repoPath, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const claudeJsonPath = join(claudeDir, 'claude.json');
  upsertNakirosMcpConfig(claudeJsonPath, workspaceId, mcpServerUrl);
}

export function syncToRepos(workspace: StoredWorkspace, mcpServerUrl: string): void {
  syncWorkspaceSymlinks(workspace);

  for (const repo of workspace.repos) {
    writeClaudeJson(repo.localPath, workspace.id, mcpServerUrl);
  }
}
