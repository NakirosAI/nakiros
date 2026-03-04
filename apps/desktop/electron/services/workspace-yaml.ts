import { app } from 'electron';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';

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

/**
 * Écrit workspace.yaml dans app support ET dans workspacePath (.nakiros.workspace.yaml).
 * - App support = source de vérité Nakiros
 * - workspacePath = cible user (mono: repo unique, multi: dossier parent workspace)
 * Returns: cwd à utiliser pour lancer l'agent
 */
export function syncWorkspaceYaml(workspace: StoredWorkspace): string {
  const yaml = buildWorkspaceYaml(workspace);

  // 1. Écrire dans app support (source de vérité)
  const appDir = getWorkspaceAppDir(workspace.id);
  writeFileSync(join(appDir, 'workspace.yaml'), yaml, 'utf-8');

  // 2. Propager dans la cible workspace utilisateur
  if (workspace.workspacePath) {
    mkdirSync(workspace.workspacePath, { recursive: true });
    writeFileSync(join(workspace.workspacePath, '.nakiros.workspace.yaml'), yaml, 'utf-8');

    for (const repo of workspace.repos) {
      if (repo.localPath !== workspace.workspacePath) {
        writeFileSync(join(repo.localPath, '.nakiros.workspace.yaml'), yaml, 'utf-8');
      }
    }

    return workspace.workspacePath;
  }

  // Compat: fallback primary repo si ancien workspace sans workspacePath
  const primaryRepoPath = workspace.repos[0]?.localPath;
  if (primaryRepoPath) {
    writeFileSync(join(primaryRepoPath, '.nakiros.workspace.yaml'), yaml, 'utf-8');
    return primaryRepoPath;
  }

  // Fallback: workspace dir en app support
  return appDir;
}
