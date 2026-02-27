import { app } from 'electron';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@tiqora/shared';

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

  return [
    `# Géré par Tiqora`,
    `workspace:`,
    `  name: ${workspace.name}`,
    `  repos:`,
    reposYaml,
    workspace.pmTool ? `  pmTool: ${workspace.pmTool}` : '',
    workspace.projectKey ? `  projectKey: ${workspace.projectKey}` : '',
    workspace.documentLanguage ? `  document_language: ${workspace.documentLanguage}` : '',
    workspace.topology ? `  topology: ${workspace.topology}` : '',
  ].filter(Boolean).join('\n') + '\n';
}

/**
 * Écrit workspace.yaml dans app support ET dans workspacePath (.tiqora.workspace.yaml).
 * - App support = source de vérité Tiqora
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
    writeFileSync(join(workspace.workspacePath, '.tiqora.workspace.yaml'), yaml, 'utf-8');

    for (const repo of workspace.repos) {
      if (repo.localPath !== workspace.workspacePath) {
        writeFileSync(join(repo.localPath, '.tiqora.workspace.yaml'), yaml, 'utf-8');
      }
    }

    return workspace.workspacePath;
  }

  // Compat: fallback primary repo si ancien workspace sans workspacePath
  const primaryRepoPath = workspace.repos[0]?.localPath;
  if (primaryRepoPath) {
    writeFileSync(join(primaryRepoPath, '.tiqora.workspace.yaml'), yaml, 'utf-8');
    return primaryRepoPath;
  }

  // Fallback: workspace dir en app support
  return appDir;
}
