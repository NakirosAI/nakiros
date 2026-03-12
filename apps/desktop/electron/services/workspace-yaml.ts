import { app } from 'electron';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { resolveWorkspaceSlug } from './workspace.js';
import { getStoredToken } from './auth.js';

export function getWorkspaceAppDir(wsId: string): string {
  const dir = join(app.getPath('userData'), wsId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function buildWorkspaceYaml(workspace: StoredWorkspace): string {
  const reposYaml = workspace.repos.map((repo, i) => [
    `    - name: ${repo.name}`,
    `      role: ${i === 0 ? 'primary' : (repo.role || 'secondary')}`,
    `      localPath: ${repo.localPath}`,
    `      profile: ${repo.profile}`,
  ].join('\n')).join('\n');

  const jiraBlock = workspace.pmTool === 'jira' && workspace.projectKey ? [
    `  jira:`,
    `    project_key: ${workspace.projectKey}`,
    workspace.pmBoardId ? `    board_id: '${workspace.pmBoardId}'` : '',
    workspace.boardType ? `    board_type: ${workspace.boardType}` : '',
    workspace.syncFilter ? `    sync_filter: ${workspace.syncFilter}` : '',
  ].filter(Boolean).join('\n') : '';

  return [
    `# Géré par Nakiros`,
    `workspace:`,
    `  name: ${workspace.name}`,
    workspace.topology ? `  structure: ${workspace.topology === 'mono' ? 'mono-repo' : 'multi-repo'}` : '',
    workspace.pmTool ? `  pm_tool: ${workspace.pmTool}` : '',
    jiraBlock,
    `  repos:`,
    reposYaml,
    workspace.documentLanguage ? `  document_language: ${workspace.documentLanguage}` : '',
  ].filter(Boolean).join('\n') + '\n';
}

function buildWorkspacePointerYaml(workspace: StoredWorkspace): string {
  const workspaceSlug = resolveWorkspaceSlug(workspace.id, workspace.name);
  return [
    '# Managed by Nakiros',
    `workspace_name: ${workspace.name}`,
    `workspace_slug: ${workspaceSlug}`,
    '',
  ].join('\n');
}

function writeWorkspacePointer(repoPath: string, pointerYaml: string): void {
  const nakirosDir = join(repoPath, '_nakiros');
  mkdirSync(nakirosDir, { recursive: true });
  writeFileSync(join(nakirosDir, 'workspace.yaml'), pointerYaml, 'utf-8');
}

function writeClaudeMcpSettings(repoPath: string, workspaceId: string): void {
  const claudeDir = join(repoPath, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const apiBase = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';
  const token = getStoredToken(); // from Electron safeStorage, set after Clerk sign-in

  const settings = {
    mcpServers: {
      nakiros: {
        type: 'http',
        url: `${apiBase}/ws/${workspaceId}/mcp`,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      },
    },
  };
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Writes the internal app-support workspace YAML and propagates the lightweight
 * workspace pointer to each repository in the workspace.
 */
export function syncWorkspaceYaml(workspace: StoredWorkspace): string {
  const yaml = buildWorkspaceYaml(workspace);
  const pointerYaml = buildWorkspacePointerYaml(workspace);

  const appDir = getWorkspaceAppDir(workspace.id);
  writeFileSync(join(appDir, 'workspace.yaml'), yaml, 'utf-8');

  for (const repo of workspace.repos) {
    writeWorkspacePointer(repo.localPath, pointerYaml);
    writeClaudeMcpSettings(repo.localPath, workspace.id);
  }

  return workspace.workspacePath ?? workspace.repos[0]?.localPath ?? appDir;
}
