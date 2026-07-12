import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';

import type { OutputStylesExpertMutationResult } from '@nakiros/shared';

/**
 * Raw-content writer for `.claude/output-styles/<name>.md` files. Extracted
 * from `daemon/handlers/output-styles.ts`'s `outputStyles:save` handler so a
 * second call site (the bootstrap dispatch, `bootstrap-dispatch.ts`) can
 * write a style without duplicating path-traversal validation or the
 * mtime-guard logic. The `outputStyles:save` IPC handler now delegates here
 * too — same code, one owner.
 */

/**
 * Validate that `styleName` is safe (no `..`, no leading `/`) and that the
 * resolved absolute path stays within `.claude/output-styles/`. Returns the
 * resolved absolute path on success, throws on traversal attempt.
 */
export function resolveStylePath(projectPath: string, styleName: string): string {
  if (styleName.includes('..') || styleName.startsWith('/')) {
    throw new Error(`Invalid styleName — path traversal detected: ${styleName}`);
  }
  const stylesDir = join(projectPath, '.claude', 'output-styles');
  const resolved = normalize(resolve(stylesDir, styleName));
  if (!resolved.startsWith(normalize(stylesDir) + '/') && resolved !== normalize(stylesDir)) {
    throw new Error(`Invalid styleName — path escapes .claude/output-styles/: ${styleName}`);
  }
  return resolved;
}

/**
 * Write an output style's full raw content (including its `---` frontmatter
 * block) to `<projectPath>/.claude/output-styles/<styleName>`. Creates
 * parent directories for nested names (e.g. `subdir/explanatory.md`).
 *
 * Optimistic-lock: when the target already exists and `mtimeAtRead` is a
 * non-empty string, a mismatch against the current on-disk mtime returns
 * `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force
 * an unconditional write (used by the bootstrap dispatcher, which never has
 * a prior read to compare against).
 */
export function writeOutputStyleFile(
  projectPath: string,
  styleName: string,
  content: string,
  mtimeAtRead: string,
): OutputStylesExpertMutationResult {
  let absolutePath: string;
  try {
    absolutePath = resolveStylePath(projectPath, styleName);
  } catch (err) {
    return { ok: false, code: 'invalid-name', message: (err as Error).message };
  }

  if (existsSync(absolutePath) && mtimeAtRead) {
    try {
      const currentMtime = statSync(absolutePath).mtime.toISOString();
      if (currentMtime !== mtimeAtRead) {
        return { ok: false, code: 'conflict', message: `Style "${styleName}" was modified externally. Reload to continue.` };
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
    return { ok: false, code: 'fs-error', message: `Failed to write style: ${(err as Error).message}` };
  }
}
