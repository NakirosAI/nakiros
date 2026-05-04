import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { McpExpertMutationResult, McpReadResult } from '@nakiros/shared';

/**
 * Resolves the absolute path to `<projectPath>/.mcp.json`.
 */
function mcpJsonPath(projectPath: string): string {
  return join(projectPath, '.mcp.json');
}

/**
 * Read the entire `.mcp.json` file from the project root.
 *
 * Unlike the hooks/permissions experts (which extract a sub-block from
 * settings.json), this returns the full file content — `.mcp.json` is a
 * standalone file, not a sub-key of another config file.
 *
 * When `.mcp.json` does not exist, `content` is `"{}"` so the editor has a
 * valid empty-object baseline, and `exists` is `false`.
 *
 * The content is always pretty-printed via `JSON.stringify(JSON.parse(…), null, 2)`
 * to normalise whitespace before handing it to the editor.
 */
export function readMcpConfig(projectPath: string): McpReadResult {
  const filePath = mcpJsonPath(projectPath);
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

  // Normalise to pretty-printed JSON; fall back to raw string if malformed.
  let normalised: string;
  try {
    normalised = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    normalised = raw;
  }

  return {
    content: normalised,
    mtime,
    exists,
    path: filePath,
  };
}

/**
 * Write the entire `.mcp.json` file for the project.
 *
 * Optimistic-lock: if the file's current mtime differs from `mtimeAtRead`,
 * the save is aborted with `{ ok: false, code: 'conflict' }`. Pass an empty
 * `mtimeAtRead` to skip the check (safe only on first-ever write when the
 * file didn't exist at read time).
 *
 * When `jsonString` parses to an empty object (`{}`) or has no `mcpServers`
 * key (or `mcpServers` is itself `{}`), the file is deleted instead of being
 * written as an empty config — this keeps the project root clean.
 */
export function saveMcpConfig(
  projectPath: string,
  jsonString: string,
  mtimeAtRead: string,
): McpExpertMutationResult {
  const filePath = mcpJsonPath(projectPath);
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
      return { ok: false, code: 'conflict', message: '.mcp.json was modified externally' };
    }
  }

  // Parse the incoming JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { ok: false, code: 'invalid-json', message: 'Invalid JSON in mcp config' };
  }

  // Determine whether the content is effectively empty.
  // An absent file or empty {} means: delete .mcp.json to keep the project clean.
  const isEmpty = (() => {
    if (parsed === null) return true;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length === 0) return true;
    if ('mcpServers' in obj) {
      const servers = obj.mcpServers;
      if (
        servers === null ||
        (typeof servers === 'object' && !Array.isArray(servers) && Object.keys(servers as object).length === 0)
      ) {
        return true;
      }
    }
    return false;
  })();

  if (isEmpty) {
    if (fileExists) {
      try {
        unlinkSync(filePath);
      } catch (err) {
        return { ok: false, code: 'fs-error', message: (err as Error).message };
      }
    }
    return { ok: true };
  }

  try {
    writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  } catch (err) {
    return { ok: false, code: 'fs-error', message: (err as Error).message };
  }

  return { ok: true };
}
