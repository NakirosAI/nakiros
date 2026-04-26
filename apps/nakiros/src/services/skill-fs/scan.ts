import { statSync } from 'fs';
import { join, relative } from 'path';

import type { SkillFileEntry } from '@nakiros/shared';

import { safeReaddir } from './fs.js';

/**
 * Relative paths (from the skill root) that are never returned by
 * `scanSkillDirectory`. `evals/workspace` is the eval sandbox — noisy and
 * uninteresting to display.
 */
export const HIDDEN_PATHS: ReadonlySet<string> = new Set(['evals/workspace']);

/** True if `relativePath` (or any of its descendants) is under `HIDDEN_PATHS`. */
export function isHiddenPath(relativePath: string): boolean {
  for (const hidden of HIDDEN_PATHS) {
    if (relativePath === hidden || relativePath.startsWith(hidden + '/')) return true;
  }
  return false;
}

/**
 * Recursively scan a skill directory and return its tree as `SkillFileEntry[]`.
 * Hidden paths (see `HIDDEN_PATHS`) are skipped. Output is sorted with
 * directories first, then files, both alphabetical. File `sizeBytes` is
 * best-effort — unreadable files report `0`.
 */
export function scanSkillDirectory(dirPath: string, basePath: string): SkillFileEntry[] {
  const entries = safeReaddir(dirPath);
  if (entries.length === 0) return [];

  const result: SkillFileEntry[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(basePath, fullPath);

    if (isHiddenPath(relPath)) continue;

    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        relativePath: relPath,
        isDirectory: true,
        children: scanSkillDirectory(fullPath, basePath),
      });
    } else {
      let sizeBytes = 0;
      try {
        sizeBytes = statSync(fullPath).size;
      } catch {
        // ignore
      }
      result.push({
        name: entry.name,
        relativePath: relPath,
        isDirectory: false,
        sizeBytes,
      });
    }
  }

  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}
