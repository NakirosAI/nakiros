import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import type { ConversationIngestHookDiff } from '@nakiros/shared';

import { HOOK_STOP_SCRIPT_SOURCE } from './hook-script.js';
import {
  getClaudeGlobalSettingsPath,
  getHookCommandString,
  getIngestHookScriptPath,
} from './paths.js';

/**
 * Install / inspect / uninstall the Stop hook entry that Nakiros owns inside
 * `~/.claude/settings.json`. We only touch the **hooks.Stop** array, and only
 * the entries whose `hooks[].command` exactly matches the canonical Nakiros
 * command string — every other matcher / event / value is round-tripped
 * verbatim so the Permissions and Hooks tabs (which also write this file) can
 * coexist safely.
 */

const STOP_EVENT_KEY = 'Stop';

function readSettings(path: string): { exists: boolean; raw: string; parsed: Record<string, unknown> } {
  if (!existsSync(path)) {
    return { exists: false, raw: '', parsed: {} };
  }
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { exists: false, raw: '', parsed: {} };
  }
  if (raw.trim().length === 0) {
    return { exists: true, raw, parsed: {} };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { exists: true, raw, parsed: parsed as Record<string, unknown> };
    }
  } catch {
    // Corrupt — return as if empty. We refuse to mutate further down rather
    // than overwriting an unparseable file.
  }
  return { exists: true, raw, parsed: {} };
}

interface MatcherGroup {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

/** True iff the matcher group contains exactly the Nakiros Stop-hook command. */
function isNakirosGroup(group: MatcherGroup): boolean {
  if (!group || typeof group !== 'object') return false;
  if (!Array.isArray(group.hooks)) return false;
  const cmd = getHookCommandString();
  return group.hooks.some((h) => h && typeof h === 'object' && h.command === cmd);
}

/** Build a fresh Nakiros-owned matcher group. */
function nakirosGroup(): MatcherGroup {
  return {
    hooks: [{ type: 'command', command: getHookCommandString() }],
  };
}

/** Pure function: given a parsed settings object, produce the next state with the Nakiros hook present. */
function withNakirosHook(parsed: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...parsed };
  const hooksRaw = next.hooks;
  const hooks: Record<string, unknown> =
    hooksRaw && typeof hooksRaw === 'object' && !Array.isArray(hooksRaw)
      ? { ...(hooksRaw as Record<string, unknown>) }
      : {};
  const stopRaw = hooks[STOP_EVENT_KEY];
  const stopGroups: MatcherGroup[] = Array.isArray(stopRaw)
    ? (stopRaw as MatcherGroup[]).filter((g) => g && typeof g === 'object')
    : [];
  // Drop any pre-existing Nakiros group (defensive — re-install is idempotent),
  // then append exactly one fresh one.
  const filtered = stopGroups.filter((g) => !isNakirosGroup(g));
  filtered.push(nakirosGroup());
  hooks[STOP_EVENT_KEY] = filtered;
  next.hooks = hooks;
  return next;
}

/** Pure function: produce the next state with the Nakiros hook removed. */
function withoutNakirosHook(parsed: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...parsed };
  const hooksRaw = next.hooks;
  if (!hooksRaw || typeof hooksRaw !== 'object' || Array.isArray(hooksRaw)) return next;
  const hooks = { ...(hooksRaw as Record<string, unknown>) };
  const stopRaw = hooks[STOP_EVENT_KEY];
  if (!Array.isArray(stopRaw)) return next;
  const filtered = (stopRaw as MatcherGroup[]).filter((g) => !isNakirosGroup(g));
  if (filtered.length > 0) {
    hooks[STOP_EVENT_KEY] = filtered;
  } else {
    delete hooks[STOP_EVENT_KEY];
  }
  if (Object.keys(hooks).length > 0) {
    next.hooks = hooks;
  } else {
    delete next.hooks;
  }
  return next;
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

/** Returns true if `~/.claude/settings.json` currently has the Nakiros Stop hook installed. */
export function isHookInstalled(): boolean {
  const path = getClaudeGlobalSettingsPath();
  const { exists, parsed } = readSettings(path);
  if (!exists) return false;
  const hooksRaw = parsed.hooks;
  if (!hooksRaw || typeof hooksRaw !== 'object' || Array.isArray(hooksRaw)) return false;
  const stopRaw = (hooksRaw as Record<string, unknown>)[STOP_EVENT_KEY];
  if (!Array.isArray(stopRaw)) return false;
  return (stopRaw as MatcherGroup[]).some(isNakirosGroup);
}

/**
 * Build the diff payload shown to the user before they enable ingestion. The
 * UI renders `current` and `next` side-by-side so the user can audit the
 * settings.json mutation before consenting.
 */
export function previewHookDiff(): ConversationIngestHookDiff {
  const path = getClaudeGlobalSettingsPath();
  const { exists, raw, parsed } = readSettings(path);
  const next = withNakirosHook(parsed);
  return {
    settingsPath: path,
    exists,
    current: exists ? raw : '',
    next: JSON.stringify(next, null, 2) + '\n',
    hookScriptPath: getIngestHookScriptPath(),
  };
}

/**
 * Install the Stop hook + write the hook-stop.cjs script to disk. Idempotent —
 * calling twice leaves exactly one Nakiros entry in `hooks.Stop`. Throws on
 * write failure so the caller can surface a `settings-write-failed` mutation
 * result to the UI.
 */
export function installHook(): void {
  // 1. Write the hook script first — if Claude Code somehow fires Stop between
  // step 1 and 2 (it can't, but defensive), the command would silently no-op
  // rather than fail loudly.
  const scriptPath = getIngestHookScriptPath();
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, HOOK_STOP_SCRIPT_SOURCE, 'utf8');
  try {
    chmodSync(scriptPath, 0o755);
  } catch {
    // Best-effort — `node` doesn't need the executable bit, but we set it for
    // shells that try to invoke the file directly via shebang.
  }

  // 2. Mutate settings.json.
  const settingsPath = getClaudeGlobalSettingsPath();
  const { parsed } = readSettings(settingsPath);
  const next = withNakirosHook(parsed);
  writeAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n');
}

/**
 * Remove the Nakiros Stop hook from settings.json and delete the on-disk
 * hook script. Idempotent — safe to call when nothing is installed.
 */
export function uninstallHook(): void {
  const settingsPath = getClaudeGlobalSettingsPath();
  const { exists, parsed } = readSettings(settingsPath);
  if (exists) {
    const next = withoutNakirosHook(parsed);
    writeAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n');
  }

  const scriptPath = getIngestHookScriptPath();
  if (existsSync(scriptPath)) {
    try {
      unlinkSync(scriptPath);
    } catch {
      // Non-fatal — leaving the script behind is harmless without the
      // settings.json reference.
    }
  }
}
