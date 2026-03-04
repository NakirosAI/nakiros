import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';

// Dossiers Nakiros à supprimer dans chaque repo lors d'un reset complet
// Note: _nakiros/ contient des docs versionnées — ne supprimer qu'en cas de reset explicite
const NAKIROS_DIRS = ['_nakiros'];

// Fichiers Nakiros à supprimer dans chaque repo
// NB : CLAUDE.md, .cursorrules, llms.txt sont intentionnellement exclus
const NAKIROS_FILES = ['.nakiros.yaml', '.nakiros.workspace.yaml'];

export interface ResetResult {
  deletedPaths: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Supprime tous les fichiers/dossiers Nakiros de tous les repos du workspace.
 * Ne touche PAS aux fichiers agent standards (CLAUDE.md, .cursorrules, llms.txt).
 * Ne touche PAS à ~/.nakiros/ (runtime global).
 */
export function resetWorkspace(workspace: StoredWorkspace): ResetResult {
  const deletedPaths: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  // Workspace-level YAML (mono: repo root, multi: workspace parent folder)
  if (workspace.workspacePath) {
    const rootYamlPath = join(workspace.workspacePath, '.nakiros.workspace.yaml');
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

    for (const dir of NAKIROS_DIRS) {
      const fullPath = join(base, dir);
      if (!existsSync(fullPath)) continue;
      try {
        rmSync(fullPath, { recursive: true, force: true });
        deletedPaths.push(fullPath);
      } catch (err) {
        errors.push({ path: fullPath, error: (err as Error).message });
      }
    }

    for (const file of NAKIROS_FILES) {
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
