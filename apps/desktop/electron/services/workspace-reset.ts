import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@tiqora/shared';

// Dossiers Tiqora à supprimer dans chaque repo
const TIQORA_DIRS = ['_tiqora', '.tiqora'];

// Fichiers Tiqora à supprimer dans chaque repo
// NB : CLAUDE.md, .cursorrules, llms.txt sont intentionnellement exclus
const TIQORA_FILES = ['.tiqora.yaml', '.tiqora.workspace.yaml'];

export interface ResetResult {
  deletedPaths: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Supprime tous les fichiers/dossiers Tiqora de tous les repos du workspace.
 * Ne touche PAS aux fichiers agent standards (CLAUDE.md, .cursorrules, llms.txt).
 */
export function resetWorkspace(workspace: StoredWorkspace): ResetResult {
  const deletedPaths: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  // Workspace-level YAML (mono: repo root, multi: workspace parent folder)
  if (workspace.workspacePath) {
    const rootYamlPath = join(workspace.workspacePath, '.tiqora.workspace.yaml');
    if (existsSync(rootYamlPath)) {
      try {
        rmSync(rootYamlPath, { force: true });
        deletedPaths.push(rootYamlPath);
      } catch (err) {
        errors.push({ path: rootYamlPath, error: (err as Error).message });
      }
    }
  }

  for (const repo of workspace.repos) {
    const base = repo.localPath;

    for (const dir of TIQORA_DIRS) {
      const fullPath = join(base, dir);
      if (!existsSync(fullPath)) continue;
      try {
        rmSync(fullPath, { recursive: true, force: true });
        deletedPaths.push(fullPath);
      } catch (err) {
        errors.push({ path: fullPath, error: (err as Error).message });
      }
    }

    for (const file of TIQORA_FILES) {
      const fullPath = join(base, file);
      if (!existsSync(fullPath)) continue;
      try {
        rmSync(fullPath, { force: true });
        deletedPaths.push(fullPath);
      } catch (err) {
        errors.push({ path: fullPath, error: (err as Error).message });
      }
    }
  }

  return { deletedPaths, errors };
}
