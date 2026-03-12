import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { resolveWorkspaceSlug } from './workspace.js';

function buildWorkspacePointerYaml(workspace: StoredWorkspace): string {
  const workspaceSlug = resolveWorkspaceSlug(workspace.id, workspace.name);
  return [
    '# Managed by Nakiros',
    `workspace_name: ${workspace.name}`,
    `workspace_slug: ${workspaceSlug}`,
    '',
  ].join('\n');
}

function writeClaudeJson(repoPath: string, workspaceId: string, mcpServerUrl: string): void {
  const claudeDir = join(repoPath, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const claudeJsonPath = join(claudeDir, 'claude.json');

  let existing: Record<string, unknown> = {};
  if (existsSync(claudeJsonPath)) {
    try {
      existing = JSON.parse(readFileSync(claudeJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Ignore malformed file.
    }
  }

  const mcpServers = (existing['mcpServers'] as Record<string, unknown>) ?? {};
  mcpServers['nakiros'] = {
    type: 'http',
    url: `${mcpServerUrl}/ws/${workspaceId}/mcp`,
  };
  existing['mcpServers'] = mcpServers;

  writeFileSync(claudeJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

export function syncToRepos(workspace: StoredWorkspace, mcpServerUrl: string): void {
  const pointerYaml = buildWorkspacePointerYaml(workspace);

  for (const repo of workspace.repos) {
    const nakirosDir = join(repo.localPath, '_nakiros');
    mkdirSync(nakirosDir, { recursive: true });
    writeFileSync(join(nakirosDir, 'workspace.yaml'), pointerYaml, 'utf-8');
    writeClaudeJson(repo.localPath, workspace.id, mcpServerUrl);
  }
}
