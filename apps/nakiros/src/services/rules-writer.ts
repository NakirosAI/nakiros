import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';

import type { RulesMutationResult } from '@nakiros/shared';

/**
 * Raw-content writer for `.claude/rules/<name>.md` files. Extracted from
 * `daemon/handlers/rules.ts`'s `rules:save` handler so a second call site
 * (the bootstrap dispatch, `bootstrap-dispatch.ts`) can write a rule without
 * duplicating path-traversal validation or the mtime-guard logic. The
 * `rules:save` IPC handler now delegates here too — same code, one owner.
 */

/**
 * Validate that `ruleName` is safe (no `..`, no leading `/`) and that the
 * resolved absolute path stays within `.claude/rules/`. Returns the resolved
 * absolute path on success, throws on traversal attempt.
 */
export function resolveRulePath(projectPath: string, ruleName: string): string {
  if (ruleName.includes('..') || ruleName.startsWith('/')) {
    throw new Error(`Invalid ruleName — path traversal detected: ${ruleName}`);
  }
  const rulesDir = join(projectPath, '.claude', 'rules');
  const resolved = normalize(resolve(rulesDir, ruleName));
  if (!resolved.startsWith(normalize(rulesDir) + '/') && resolved !== normalize(rulesDir)) {
    throw new Error(`Invalid ruleName — path escapes .claude/rules/: ${ruleName}`);
  }
  return resolved;
}

/**
 * Write a rule's full raw content (including its `---` frontmatter block)
 * to `<projectPath>/.claude/rules/<ruleName>`. Creates parent directories
 * for nested rule names (e.g. `frontend/styling.md`).
 *
 * Optimistic-lock: when the target already exists and `mtimeAtRead` is a
 * non-empty string, a mismatch against the current on-disk mtime returns
 * `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force
 * an unconditional write (used by the bootstrap dispatcher, which never has
 * a prior read to compare against).
 */
export function writeRuleFile(
  projectPath: string,
  ruleName: string,
  content: string,
  mtimeAtRead: string,
): RulesMutationResult {
  let absolutePath: string;
  try {
    absolutePath = resolveRulePath(projectPath, ruleName);
  } catch (err) {
    return { ok: false, code: 'invalid-path', message: (err as Error).message };
  }

  if (existsSync(absolutePath) && mtimeAtRead) {
    try {
      const currentMtime = statSync(absolutePath).mtime.toISOString();
      if (currentMtime !== mtimeAtRead) {
        return { ok: false, code: 'conflict', message: `Rule "${ruleName}" was modified externally. Reload to continue.` };
      }
    } catch {
      // Can't stat — proceed with write (best-effort).
    }
  }

  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, code: 'write-failed', message: `Failed to write rule: ${(err as Error).message}` };
  }
}
