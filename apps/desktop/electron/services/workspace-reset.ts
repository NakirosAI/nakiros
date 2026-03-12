import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { StoredWorkspace } from '@nakiros/shared';

const NAKIROS_DIRS = ['_nakiros'];

export interface ResetResult {
  deletedPaths: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Remove the repo-scoped Nakiros files from every repository in the workspace.
 * Does not touch ~/.nakiros/ global runtime data.
 */
export function resetWorkspace(workspace: StoredWorkspace): ResetResult {
  const deletedPaths: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

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
  }

  return { deletedPaths, errors };
}
