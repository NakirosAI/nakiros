import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';

import type { SubagentsMutationResult } from '@nakiros/shared';

/**
 * Raw-content writer for `.claude/agents/<name>.md` files. Extracted from
 * `daemon/handlers/subagents.ts`'s `subagents:save` handler so a second call
 * site (the bootstrap dispatch, `bootstrap-dispatch.ts`) can write a
 * subagent without duplicating path-traversal validation or the mtime-guard
 * logic. The `subagents:save` IPC handler now delegates here too — same
 * code, one owner.
 */

/**
 * Validate that `subagentName` is safe (no `..`, no leading `/`) and that
 * the resolved absolute path stays within `.claude/agents/`. Returns the
 * resolved absolute path on success, throws on traversal attempt.
 */
export function resolveSubagentPath(projectPath: string, subagentName: string): string {
  if (subagentName.includes('..') || subagentName.startsWith('/')) {
    throw new Error(`Invalid subagentName — path traversal detected: ${subagentName}`);
  }
  const agentsDir = join(projectPath, '.claude', 'agents');
  const resolved = normalize(resolve(agentsDir, subagentName));
  if (!resolved.startsWith(normalize(agentsDir) + '/') && resolved !== normalize(agentsDir)) {
    throw new Error(`Invalid subagentName — path escapes .claude/agents/: ${subagentName}`);
  }
  return resolved;
}

/**
 * Write a subagent's full raw content (including its `---` frontmatter
 * block) to `<projectPath>/.claude/agents/<subagentName>`. Creates parent
 * directories for nested names (e.g. `team/reviewer.md`).
 *
 * Optimistic-lock: when the target already exists and `mtimeAtRead` is a
 * non-empty string, a mismatch against the current on-disk mtime returns
 * `{ ok: false, code: 'conflict' }` instead of writing. Pass `''` to force
 * an unconditional write (used by the bootstrap dispatcher, which never has
 * a prior read to compare against).
 */
export function writeSubagentFile(
  projectPath: string,
  subagentName: string,
  content: string,
  mtimeAtRead: string,
): SubagentsMutationResult {
  let absolutePath: string;
  try {
    absolutePath = resolveSubagentPath(projectPath, subagentName);
  } catch (err) {
    return { ok: false, code: 'invalid-path', message: (err as Error).message };
  }

  if (existsSync(absolutePath) && mtimeAtRead) {
    try {
      const currentMtime = statSync(absolutePath).mtime.toISOString();
      if (currentMtime !== mtimeAtRead) {
        return { ok: false, code: 'conflict', message: `Subagent "${subagentName}" was modified externally. Reload to continue.` };
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
    return { ok: false, code: 'write-failed', message: `Failed to write subagent: ${(err as Error).message}` };
  }
}
