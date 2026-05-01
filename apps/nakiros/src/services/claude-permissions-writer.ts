import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

import type {
  PermissionsFileContent,
  PermissionsMutationErrorCode,
  PermissionsMutationResult,
  PermissionsScope,
  SavePermissionsRequest,
} from '@nakiros/shared';

/**
 * Read / save side of the `.claude/settings.json` (+ `.local`) permissions
 * editor (Module 4 V2). Splits the JSON into editor-friendly slots:
 * `permissions.{allow,deny,ask,defaultMode}` are surfaced as structured
 * fields, every other top-level key is round-tripped as a JSON string in
 * `rest` so the editor can show / edit it raw without losing data.
 *
 * The on-disk write recombines `rest` (parsed) with the structured fields,
 * so unrelated keys (model, env, hooks, apiKeyHelper, autoMemoryEnabled,
 * claudeMdExcludes, …) survive structured edits.
 */

function settingsPath(projectPath: string, scope: PermissionsScope): string {
  const filename = scope === 'project' ? 'settings.json' : 'settings.local.json';
  return join(projectPath, '.claude', filename);
}

function err(
  code: PermissionsMutationErrorCode,
  message: string,
  currentMtime?: string,
): PermissionsMutationResult {
  return { ok: false, code, message, currentMtime };
}

/**
 * Top-level keys removed from the editor's `rest` because they have their
 * own dedicated tab. Their values are stashed in `preservedJson` and merged
 * back at save time so the user never sees them as raw JSON in the
 * Permissions tab.
 *
 * - `hooks` → Hooks tab (Module 6)
 * - `outputStyle` → Output styles tab (Module 3)
 * - `mcpServers` → MCP tab (Module 5)
 */
const PRESERVED_KEYS: ReadonlySet<string> = new Set(['hooks', 'outputStyle', 'mcpServers']);

function emptyContent(scope: PermissionsScope, path: string, exists: boolean): PermissionsFileContent {
  return {
    scope,
    path,
    exists,
    mtime: '',
    allow: [],
    deny: [],
    ask: [],
    defaultMode: null,
    rest: '',
    preservedJson: '',
  };
}

export function readPermissions(
  projectPath: string,
  scope: PermissionsScope,
): PermissionsFileContent {
  const path = settingsPath(projectPath, scope);
  if (!existsSync(path)) {
    return emptyContent(scope, path, false);
  }

  let raw = '';
  let mtime = '';
  try {
    raw = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return emptyContent(scope, path, false);
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    return {
      ...emptyContent(scope, path, true),
      mtime,
      rest: raw,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...emptyContent(scope, path, true),
      mtime,
      rest: '{}',
      parseError: 'Top-level value must be a JSON object.',
    };
  }

  const permissions =
    parsed.permissions && typeof parsed.permissions === 'object'
      ? (parsed.permissions as Record<string, unknown>)
      : {};
  const allow = Array.isArray(permissions.allow)
    ? permissions.allow.filter((v): v is string => typeof v === 'string')
    : [];
  const deny = Array.isArray(permissions.deny)
    ? permissions.deny.filter((v): v is string => typeof v === 'string')
    : [];
  const ask = Array.isArray(permissions.ask)
    ? permissions.ask.filter((v): v is string => typeof v === 'string')
    : [];
  const defaultMode = typeof permissions.defaultMode === 'string'
    ? (permissions.defaultMode as PermissionsFileContent['defaultMode'])
    : null;

  // Split the rest in two: editor-visible JSON (`rest`) and opaque
  // round-trip JSON (`preserved`) for fields managed in other tabs.
  const rest: Record<string, unknown> = {};
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'permissions') continue;
    if (PRESERVED_KEYS.has(key)) preserved[key] = value;
    else rest[key] = value;
  }
  // Non-structured `permissions.*` keys stay in `rest` under permissions.
  const remainingPermissionsKeys: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (!['allow', 'deny', 'ask', 'defaultMode'].includes(key)) {
      remainingPermissionsKeys[key] = value;
    }
  }
  if (Object.keys(remainingPermissionsKeys).length > 0) {
    rest.permissions = remainingPermissionsKeys;
  }

  return {
    scope,
    path,
    exists: true,
    mtime,
    allow,
    deny,
    ask,
    defaultMode,
    rest: Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '',
    preservedJson:
      Object.keys(preserved).length > 0 ? JSON.stringify(preserved) : '',
  };
}

export function savePermissions(
  projectPath: string,
  request: SavePermissionsRequest,
): PermissionsMutationResult {
  const { scope, allow, deny, ask, defaultMode, rest, preservedJson, mtimeAtRead } = request;
  const path = settingsPath(projectPath, scope);

  // Validate `rest` is parseable JSON (or empty).
  let restObj: Record<string, unknown> = {};
  const restTrimmed = rest.trim();
  if (restTrimmed.length > 0) {
    try {
      const parsed = JSON.parse(restTrimmed) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return err(
          'invalid-rest-json',
          '"Other settings" must be a JSON object (e.g. `{}` or `{"model": "sonnet"}`).',
        );
      }
      restObj = parsed as Record<string, unknown>;
    } catch (e) {
      return err(
        'invalid-rest-json',
        `"Other settings" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Round-trip `preserved` (hooks / outputStyle) — should always parse
  // because the daemon produced it, but guard anyway.
  let preservedObj: Record<string, unknown> = {};
  const preservedTrimmed = preservedJson.trim();
  if (preservedTrimmed.length > 0) {
    try {
      const parsed = JSON.parse(preservedTrimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        preservedObj = parsed as Record<string, unknown>;
      }
    } catch {
      // Silently drop a malformed preserved blob — better than refusing the save.
    }
  }

  // mtime guard — only when the file existed at read time.
  if (mtimeAtRead && existsSync(path)) {
    let currentMtime: string;
    try {
      currentMtime = statSync(path).mtime.toISOString();
    } catch (e) {
      return err('write-failed', e instanceof Error ? e.message : String(e));
    }
    if (currentMtime !== mtimeAtRead) {
      return err(
        'conflict',
        'This settings file was modified outside Nakiros while you were editing. Reload to see the latest version.',
        currentMtime,
      );
    }
  }

  // Re-assemble final object: `rest` + `preserved` + `permissions`.
  // Order matters: rest first (model, env, …) then preserved (hooks,
  // outputStyle), then permissions last so the structured fields take
  // precedence over anything an inconsistent rest blob might have set.
  const finalObj: Record<string, unknown> = { ...restObj, ...preservedObj };
  const existingPermissions =
    finalObj.permissions && typeof finalObj.permissions === 'object'
      ? (finalObj.permissions as Record<string, unknown>)
      : {};
  const permissionsOut: Record<string, unknown> = { ...existingPermissions };
  if (allow.length > 0) permissionsOut.allow = allow;
  else delete permissionsOut.allow;
  if (deny.length > 0) permissionsOut.deny = deny;
  else delete permissionsOut.deny;
  if (ask.length > 0) permissionsOut.ask = ask;
  else delete permissionsOut.ask;
  if (defaultMode) permissionsOut.defaultMode = defaultMode;
  else delete permissionsOut.defaultMode;
  if (Object.keys(permissionsOut).length > 0) {
    finalObj.permissions = permissionsOut;
  } else {
    delete finalObj.permissions;
  }

  const content = JSON.stringify(finalObj, null, 2) + '\n';
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return { ok: true, file: readPermissions(projectPath, scope) };
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
