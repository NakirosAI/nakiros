import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';
import { getNakirosWorkspaceDir, resolveWorkspaceSlug } from './workspace.js';

function pathExists(p: string): boolean {
  try {
    lstatSync(p); // lstat ne suit pas les symlinks, détecte les liens cassés
    return true;
  } catch {
    return false;
  }
}

/**
 * Crée/met à jour les symlinks dans ~/.nakiros/workspaces/{slug}/
 * pointant vers chaque repo du workspace.
 *
 * Structure résultante :
 *   ~/.nakiros/workspaces/mon-projet/
 *     ├── workspace.yaml       ← canonical config (géré par workspace-yaml.ts)
 *     ├── frontend/            ← symlink → ~/code/mon-projet-frontend
 *     └── backend/             ← symlink → ~/code/mon-projet-backend
 *
 * Les agents (claude, codex, cursor) tournent dans ce dossier et voient
 * tous les repos sans configuration supplémentaire.
 */
export function syncWorkspaceSymlinks(workspace: StoredWorkspace): void {
  const slug = resolveWorkspaceSlug(workspace.id, workspace.name);
  const wsDir = getNakirosWorkspaceDir(slug);
  mkdirSync(wsDir, { recursive: true });

  const expectedNames = new Set(workspace.repos.map(r => r.name));

  // Supprimer les symlinks orphelins (repos retirés du workspace)
  for (const entry of readdirSync(wsDir)) {
    if (entry === 'workspace.yaml') continue;
    const entryPath = join(wsDir, entry);
    try {
      if (lstatSync(entryPath).isSymbolicLink() && !expectedNames.has(entry)) {
        unlinkSync(entryPath);
      }
    } catch {
      // ignore si le fichier a disparu entre le readdir et le lstat
    }
  }

  // Créer/mettre à jour les symlinks pour chaque repo
  for (const repo of workspace.repos) {
    const linkPath = join(wsDir, repo.name);
    // Supprimer le lien existant si la cible a changé
    if (pathExists(linkPath)) {
      unlinkSync(linkPath);
    }
    symlinkSync(repo.localPath, linkPath);
  }
}

/**
 * Supprime tous les symlinks du dossier workspace (utilisé au reset).
 * Ne touche pas workspace.yaml.
 */
export function removeWorkspaceSymlinks(workspaceSlug: string): void {
  const wsDir = getNakirosWorkspaceDir(workspaceSlug);
  if (!pathExists(wsDir)) return;

  for (const entry of readdirSync(wsDir)) {
    if (entry === 'workspace.yaml') continue;
    const entryPath = join(wsDir, entry);
    try {
      if (lstatSync(entryPath).isSymbolicLink()) {
        unlinkSync(entryPath);
      }
    } catch {
      // ignore
    }
  }
}
