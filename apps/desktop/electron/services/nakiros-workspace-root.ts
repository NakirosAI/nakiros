import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GLOBAL_NAKIROS_DIRS = ['agents', 'workflows', 'core', 'workspaces'] as const;

/**
 * Ensure ~/.nakiros/ exists with its top-level structure.
 * Called once during onboarding install.
 */
export function ensureGlobalNakirosRoot(): string {
  const root = join(homedir(), '.nakiros');
  mkdirSync(root, { recursive: true });
  for (const dir of GLOBAL_NAKIROS_DIRS) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}
