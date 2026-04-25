import { readdirSync, statSync, type Dirent } from 'fs';

/** `readdirSync(..., { withFileTypes: true })` that returns `[]` on any error. */
export function safeReaddir(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }) as Dirent[];
  } catch {
    return [];
  }
}

/** True if `path` resolves (following symlinks) to a directory. False on any error. */
export function isDirectoryStat(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
