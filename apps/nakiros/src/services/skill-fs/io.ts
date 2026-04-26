import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Resolve `relativePath` against `skillDir` and return the absolute path only
 * if it stays within `skillDir`. Returns `null` on path-traversal attempts
 * (e.g. `relativePath = '../../etc/passwd'`).
 */
export function validateSkillFilePath(skillDir: string, relativePath: string): string | null {
  const filePath = join(skillDir, relativePath);
  if (!filePath.startsWith(skillDir)) return null;
  return filePath;
}

/**
 * Read a file inside a skill directory by relative path. Returns `null` on
 * path-traversal, missing file, or read error.
 */
export function readSkillFileSafe(skillDir: string, relativePath: string): string | null {
  const filePath = validateSkillFilePath(skillDir, relativePath);
  if (!filePath) return null;
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write a file inside a skill directory by relative path. Path-traversal
 * attempts are silently ignored (returns without writing).
 */
export function writeSkillFileSafe(skillDir: string, relativePath: string, content: string): void {
  const filePath = validateSkillFilePath(skillDir, relativePath);
  if (!filePath) return;
  writeFileSync(filePath, content, 'utf8');
}
