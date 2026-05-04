import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { PermissionsExpertMutationResult, PermissionsExpertScope, PermissionsReadResult } from '@nakiros/shared';

/**
 * Resolves the absolute path to the settings file for the given scope.
 *
 * - `'project'` → `<projectPath>/.claude/settings.json`
 * - `'local'`   → `<projectPath>/.claude/settings.local.json`
 */
function settingsFilePath(projectPath: string, scope: PermissionsExpertScope): string {
  const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
  return join(projectPath, '.claude', filename);
}

/**
 * Read the `permissions` block from the project's settings file for the given
 * scope (`settings.json` for `'project'`, `settings.local.json` for `'local'`).
 *
 * Returns only the permissions block as pretty-printed JSON — all other
 * settings keys (hooks, env, model, etc.) are intentionally excluded.
 *
 * When the target file does not exist or contains no `permissions` key,
 * `content` is `"{}"` so the editor has a valid empty-object baseline.
 */
export function readPermissionsBlock(projectPath: string, scope: PermissionsExpertScope): PermissionsReadResult {
  const filePath = settingsFilePath(projectPath, scope);
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
    // File exists but is malformed — return empty permissions so the editor
    // can bootstrap, but keep mtime so a subsequent save triggers a conflict.
    return { content: '{}', mtime, exists, path: filePath };
  }

  const permissions = parsed.permissions ?? {};
  return {
    content: JSON.stringify(permissions, null, 2),
    mtime,
    exists,
    path: filePath,
  };
}

/**
 * Merge a new permissions block into the project's settings file for the given
 * scope, preserving every other key (hooks, env, model, outputStyle, etc.).
 *
 * Optimistic-lock: if the file's current mtime differs from `mtimeAtRead`,
 * the save is aborted with `{ ok: false, code: 'conflict' }`. Pass an empty
 * `mtimeAtRead` to skip the check (safe only on first-ever write when the
 * file didn't exist at read time).
 *
 * When `permissionsJsonString` parses to an empty object `{}` or `null`, the
 * `permissions` key is removed from the file rather than written as `{}`.
 *
 * If the target file does not yet exist (common for `settings.local.json`), it
 * is created with only the `permissions` key.
 */
export function savePermissionsBlock(
  projectPath: string,
  scope: PermissionsExpertScope,
  permissionsJsonString: string,
  mtimeAtRead: string,
): PermissionsExpertMutationResult {
  const filePath = settingsFilePath(projectPath, scope);
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
      const filename = scope === 'local' ? 'settings.local.json' : 'settings.json';
      return { ok: false, code: 'conflict', message: `${filename} was modified externally` };
    }
  }

  // Parse the incoming permissions block.
  let parsedPermissions: unknown;
  try {
    parsedPermissions = JSON.parse(permissionsJsonString);
  } catch {
    return { ok: false, code: 'invalid-json', message: 'Invalid JSON in permissions block' };
  }

  // Determine whether the permissions block is empty ({} or null → remove the key).
  const isEmpty =
    parsedPermissions === null ||
    (typeof parsedPermissions === 'object' &&
      !Array.isArray(parsedPermissions) &&
      Object.keys(parsedPermissions as object).length === 0);

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

  // Merge: replace only the `permissions` key.
  if (isEmpty) {
    delete existing.permissions;
  } else {
    existing.permissions = parsedPermissions;
  }

  try {
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  } catch (err) {
    return { ok: false, code: 'fs-error', message: (err as Error).message };
  }

  return { ok: true };
}
