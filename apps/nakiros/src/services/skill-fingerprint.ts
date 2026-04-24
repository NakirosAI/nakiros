import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Deterministic content hash of a skill directory. Used by the eval matrix to
 * distinguish a "real" regression (skill actually changed between two
 * iterations) from a "noisy" one (LLM judge variance — identical skill,
 * different grading).
 *
 * Rules:
 *  - Walk every file under `skillDir`.
 *  - Skip volatile or runtime-only subtrees that would bust the hash without
 *    reflecting a real change in skill behaviour (`evals/workspace/`, git
 *    metadata, node_modules, caches).
 *  - For each remaining file, hash `<relative-path>\n<content>` so both
 *    renames and content edits flip the fingerprint.
 *  - Sort entries by path so the order of `readdirSync` doesn't matter.
 *  - Fold everything into a single SHA-256.
 */

const EXCLUDED_TOP_DIRS = new Set(['node_modules', '.git', '.turbo', '.next', 'dist']);
const EXCLUDED_ANYWHERE = new Set(['.DS_Store']);

/**
 * Paths to exclude relative to the skill dir. Normalised with forward slashes.
 * `evals/workspace/` is where past runs live — it changes every iteration and
 * would defeat the whole point of the fingerprint.
 */
const EXCLUDED_RELATIVE_PREFIXES = ['evals/workspace/'];

/**
 * Compute a deterministic SHA-256 content hash of a skill directory. Used by
 * the eval matrix to distinguish a real regression (skill actually changed)
 * from LLM-judge variance (identical skill, different grading). Also used by
 * the comparison runner to decide whether a previous iteration's artefacts
 * can be reused verbatim instead of being re-run.
 *
 * Walks every file under `skillDir`, skipping volatile subtrees
 * (`evals/workspace/`, `.git`, `node_modules`, build caches, `.DS_Store`) and
 * anything larger than 5 MB. Files are sorted by path before hashing so the
 * order of `readdirSync` doesn't affect the result.
 *
 * @returns fingerprint prefixed with `sha256:`
 */
export function computeSkillFingerprint(skillDir: string): string {
  const entries: Array<{ rel: string; content: Buffer }> = [];

  const walk = (dir: string): void => {
    let items: import('fs').Dirent[];
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (EXCLUDED_ANYWHERE.has(item.name)) continue;
      const full = join(dir, item.name);
      const rel = relative(skillDir, full).replace(/\\/g, '/');

      if (item.isDirectory()) {
        if (EXCLUDED_TOP_DIRS.has(item.name)) continue;
        if (EXCLUDED_RELATIVE_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
        walk(full);
        continue;
      }
      if (!item.isFile()) continue;

      // Belt + suspenders: skip files inside an excluded prefix even if the
      // directory traversal missed it (symlinks, edge cases).
      if (EXCLUDED_RELATIVE_PREFIXES.some((p) => rel.startsWith(p))) continue;

      // Skip files larger than 5 MB — they are almost certainly not source of
      // skill behaviour and would just slow the hash down.
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size > 5 * 1024 * 1024) continue;

      try {
        entries.push({ rel, content: readFileSync(full) });
      } catch {
        // best-effort
      }
    }
  };

  walk(skillDir);
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const h = createHash('sha256');
  for (const e of entries) {
    h.update(e.rel);
    h.update('\n');
    h.update(e.content);
    h.update('\n');
  }
  return `sha256:${h.digest('hex')}`;
}
