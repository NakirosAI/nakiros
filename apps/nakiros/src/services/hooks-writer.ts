import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { HooksExpertMutationResult, HooksReadResult } from '@nakiros/shared';

/**
 * Resolves the absolute path to `<projectPath>/.claude/settings.json`.
 */
function settingsJsonPath(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json');
}

/**
 * Read the `hooks` block from the project's `.claude/settings.json`.
 *
 * Returns only the hooks block as pretty-printed JSON — all other settings
 * keys (permissions, env, model, etc.) are intentionally excluded. Use the
 * permissions editor for the rest.
 *
 * When `.claude/settings.json` does not exist or contains no `hooks` key,
 * `content` is `"{}"` so the editor has a valid empty-object baseline.
 */
export function readHooksBlock(projectPath: string): HooksReadResult {
  const filePath = settingsJsonPath(projectPath);
  const exists = existsSync(filePath);

  if (!exists) {
    return {
      content: '{}',
      mtime: '',
      exists: false,
      path: filePath,
    };
  }

  let mtime = '';
  try {
    mtime = statSync(filePath).mtime.toISOString();
  } catch {
    // ignore — file may have disappeared between existsSync and statSync
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return { content: '{}', mtime, exists, path: filePath };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File exists but is malformed — return empty hooks so the editor can
    // bootstrap, but keep mtime so a subsequent save triggers a conflict.
    return { content: '{}', mtime, exists, path: filePath };
  }

  const hooks = parsed.hooks ?? {};
  return {
    content: JSON.stringify(hooks, null, 2),
    mtime,
    exists,
    path: filePath,
  };
}

/**
 * Merge a new hooks block into the project's `.claude/settings.json`,
 * preserving every other key (permissions, env, model, outputStyle, etc.).
 *
 * Optimistic-lock: if the file's current mtime differs from `mtimeAtRead`,
 * the save is aborted with `{ ok: false, code: 'conflict' }`. Pass an empty
 * `mtimeAtRead` to skip the check (safe only on first-ever write when the
 * file didn't exist at read time).
 *
 * When `hooksJsonString` parses to an empty object `{}` or `null`, the
 * `hooks` key is removed from settings.json rather than written as `{}`.
 */
export function saveHooksBlock(
  projectPath: string,
  hooksJsonString: string,
  mtimeAtRead: string,
): HooksExpertMutationResult {
  const filePath = settingsJsonPath(projectPath);
  const fileExists = existsSync(filePath);

  // Optimistic-lock check — skip when mtimeAtRead is empty (first write,
  // file didn't exist at read time) or when the file doesn't exist yet.
  if (mtimeAtRead && fileExists) {
    let currentMtime = '';
    try {
      currentMtime = statSync(filePath).mtime.toISOString();
    } catch {
      // ignore
    }
    if (currentMtime !== mtimeAtRead) {
      return { ok: false, code: 'conflict', message: 'settings.json was modified externally' };
    }
  }

  // Parse the incoming hooks block.
  let parsedHooks: unknown;
  try {
    parsedHooks = JSON.parse(hooksJsonString);
  } catch {
    return { ok: false, code: 'invalid-json', message: 'Invalid JSON in hooks block' };
  }

  // Determine whether the hooks block is empty ({}  or null → remove the key).
  const isEmpty =
    parsedHooks === null ||
    (typeof parsedHooks === 'object' && !Array.isArray(parsedHooks) && Object.keys(parsedHooks as object).length === 0);

  // Read existing settings (or start with {}).
  let existing: Record<string, unknown> = {};
  if (fileExists) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Treat a parse error as an empty object — the write will overwrite it.
    }
  }

  // Merge: replace only the `hooks` key.
  if (isEmpty) {
    delete existing.hooks;
  } else {
    existing.hooks = parsedHooks;
  }

  try {
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  } catch (err) {
    return { ok: false, code: 'fs-error', message: (err as Error).message };
  }

  return { ok: true };
}
