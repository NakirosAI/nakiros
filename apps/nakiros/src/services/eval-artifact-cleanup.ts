import { existsSync, lstatSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Pattern prefix used in eval prompts that force the agent to name generated skills
 * with a predictable prefix. Anything matching this in user skill dirs is considered
 * eval-produced garbage and can be safely removed.
 */
const EVAL_SKILL_PREFIX = 'nakiros-eval-';

/**
 * Directories scanned for stray eval-produced skills.
 * The eval runner's cwd lives in ~/.nakiros/tmp-skills/ (for fix runs) or the skill's
 * own evals/workspace/ dir, but agents sometimes write to user locations anyway.
 */
function getScanRoots(): string[] {
  return [
    join(homedir(), '.claude', 'skills'),
    join(homedir(), '.nakiros', 'skills'),
  ];
}

function removeIfDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = lstatSync(path);
    // Only remove real dirs — we never want to accidentally break a symlink
    if (stat.isSymbolicLink()) return false;
    if (!stat.isDirectory()) return false;
    rmSync(path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove all skill directories whose name starts with `nakiros-eval-` from the
 * user's global skill locations. Called after an eval run and at app boot.
 *
 * Safe: only deletes dirs matching the eval prefix, never touches symlinks,
 * never touches project-local skills.
 *
 * Returns the list of removed paths (for logging).
 */
export function cleanupEvalArtifacts(): string[] {
  const removed: string[] = [];
  for (const root of getScanRoots()) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith(EVAL_SKILL_PREFIX)) continue;
      const full = join(root, name);
      if (removeIfDirectory(full)) {
        removed.push(full);
      }
    }
  }
  if (removed.length > 0) {
    console.log(`[eval-artifact-cleanup] Removed ${removed.length} stray eval skill(s):`, removed);
  }
  return removed;
}
