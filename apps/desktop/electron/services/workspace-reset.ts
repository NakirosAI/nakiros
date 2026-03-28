import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { resolveWorkspaceSlug } from './workspace.js';
import { removeWorkspaceSymlinks } from './workspace-symlinks.js';

export interface ResetResult {
  deletedPaths: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Remove Nakiros artifacts from every repository in the workspace and delete
 * the symlinks in ~/.nakiros/workspaces/{slug}/.
 * Does not touch ~/.nakiros/ canonical YAML or global runtime data.
 */
export function resetWorkspace(workspace: StoredWorkspace): ResetResult {
  const deletedPaths: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  // Supprimer les symlinks du dossier workspace
  try {
    const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
    removeWorkspaceSymlinks(slug);
    deletedPaths.push(`~/.nakiros/workspaces/${slug}/ (symlinks)`);
  } catch (err) {
    errors.push({ path: '~/.nakiros/workspaces/', error: (err as Error).message });
  }

  // Supprimer .claude/settings.json dans chaque repo si besoin
  for (const repo of workspace.repos) {
    const claudeSettings = join(repo.localPath, '.claude', 'settings.json');
    if (!existsSync(claudeSettings)) continue;
    try {
      rmSync(claudeSettings, { force: true });
      deletedPaths.push(claudeSettings);
    } catch (err) {
      errors.push({ path: claudeSettings, error: (err as Error).message });
    }
  }

  return { deletedPaths, errors };
}
