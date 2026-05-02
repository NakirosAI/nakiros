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
  HookEditEntry,
  HookEditEvent,
  HookEventName,
  HooksFileContent,
  HooksMutationErrorCode,
  HooksMutationResult,
  PermissionsScope,
  SaveHooksRequest,
} from '@nakiros/shared';

/**
 * Read / save side of the `.claude/settings.json` (+ `.local`) hooks block.
 * Edits **only** the `hooks` slice; everything else (permissions, model, env,
 * mcpServers, outputStyle, …) is round-tripped via an opaque `preservedJson`
 * blob so concurrent ownership with the Permissions tab is safe.
 *
 * Storage shape on disk follows Claude Code's spec:
 * `hooks.<event>` is an array of MatcherGroup, each with `matcher` (string,
 * optional) and `hooks` (array of `{ type, command, timeout? }`). The editor
 * flattens the matcher groups into one row per (matcher × command), and
 * un-flattens at save time by emitting one MatcherGroup per row.
 */

const HOOK_EVENTS: HookEventName[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionEnd',
];

function settingsPath(projectPath: string, scope: PermissionsScope): string {
  const filename = scope === 'project' ? 'settings.json' : 'settings.local.json';
  return join(projectPath, '.claude', filename);
}

function err(
  code: HooksMutationErrorCode,
  message: string,
  currentMtime?: string,
): HooksMutationResult {
  return { ok: false, code, message, currentMtime };
}

function emptyEvents(): HookEditEvent[] {
  return HOOK_EVENTS.map((event) => ({ event, entries: [] }));
}

export function readHooks(
  projectPath: string,
  scope: PermissionsScope,
): HooksFileContent {
  const path = settingsPath(projectPath, scope);
  if (!existsSync(path)) {
    return {
      scope,
      path,
      exists: false,
      mtime: '',
      events: emptyEvents(),
      preservedJson: '',
    };
  }

  let raw = '';
  let mtime = '';
  try {
    raw = readFileSync(path, 'utf8');
    mtime = statSync(path).mtime.toISOString();
  } catch {
    return {
      scope,
      path,
      exists: false,
      mtime: '',
      events: emptyEvents(),
      preservedJson: '',
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    return {
      scope,
      path,
      exists: true,
      mtime,
      events: emptyEvents(),
      preservedJson: '',
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      scope,
      path,
      exists: true,
      mtime,
      events: emptyEvents(),
      preservedJson: '',
      parseError: 'Top-level value must be a JSON object.',
    };
  }

  const hooksObj =
    parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks)
      ? (parsed.hooks as Record<string, unknown>)
      : {};

  const events: HookEditEvent[] = HOOK_EVENTS.map((event) => ({
    event,
    entries: flattenEvent(hooksObj[event]),
  }));

  // Preserved = everything except `hooks`.
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key !== 'hooks') preserved[key] = value;
  }

  return {
    scope,
    path,
    exists: true,
    mtime,
    events,
    preservedJson:
      Object.keys(preserved).length > 0 ? JSON.stringify(preserved) : '',
  };
}

export function saveHooks(
  projectPath: string,
  request: SaveHooksRequest,
): HooksMutationResult {
  const { scope, events, preservedJson, mtimeAtRead } = request;
  const path = settingsPath(projectPath, scope);

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

  // Round-trip preserved blob (silently drop a malformed blob — better than
  // refusing the save when the daemon produced it).
  let preservedObj: Record<string, unknown> = {};
  const preservedTrimmed = preservedJson.trim();
  if (preservedTrimmed.length > 0) {
    try {
      const parsed = JSON.parse(preservedTrimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        preservedObj = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  // Build the `hooks` block from the editor events.
  const hooksOut: Record<string, unknown> = {};
  for (const ev of events) {
    const groups: Array<Record<string, unknown>> = [];
    for (const entry of ev.entries) {
      const cmd = entry.command.trim();
      if (cmd.length === 0) continue; // drop empty rows
      const group: Record<string, unknown> = {};
      const matcher = entry.matcher.trim();
      if (matcher.length > 0) group.matcher = matcher;
      const hookCmd: Record<string, unknown> = { type: 'command', command: cmd };
      if (typeof entry.timeout === 'number' && entry.timeout > 0) {
        hookCmd.timeout = entry.timeout;
      }
      group.hooks = [hookCmd];
      groups.push(group);
    }
    if (groups.length > 0) {
      hooksOut[ev.event] = groups;
    }
  }

  // Re-assemble final object.
  const finalObj: Record<string, unknown> = { ...preservedObj };
  if (Object.keys(hooksOut).length > 0) {
    finalObj.hooks = hooksOut;
  } else {
    delete finalObj.hooks;
  }

  const content = JSON.stringify(finalObj, null, 2) + '\n';
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return { ok: true, file: readHooks(projectPath, scope) };
}

/**
 * Flatten an `hooks.<event>` array into one editor row per
 * (matcher × command) tuple. Tolerates the legacy flat shape
 * `[{ matcher, command }]` as well as the canonical
 * `[{ matcher, hooks: [{ type, command, timeout? }, ...] }]`.
 */
function flattenEvent(value: unknown): HookEditEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HookEditEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const matcher = typeof obj.matcher === 'string' ? obj.matcher : '';
    const inner = obj.hooks;
    if (Array.isArray(inner) && inner.length > 0) {
      for (const h of inner) {
        if (!h || typeof h !== 'object') continue;
        const hObj = h as Record<string, unknown>;
        if (typeof hObj.command !== 'string') continue;
        out.push({
          matcher,
          command: hObj.command,
          timeout: typeof hObj.timeout === 'number' ? hObj.timeout : null,
        });
      }
    } else if (typeof obj.command === 'string') {
      out.push({
        matcher,
        command: obj.command,
        timeout: typeof obj.timeout === 'number' ? obj.timeout : null,
      });
    }
  }
  return out;
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
