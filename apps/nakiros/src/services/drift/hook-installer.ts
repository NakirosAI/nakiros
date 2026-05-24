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

import type { DriftHookDiff, DriftHookStatus } from '@nakiros/shared';

import { HOOK_STOP_SCRIPT_SOURCE, HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE } from './hook-script.js';
import {
  getClaudeGlobalSettingsPath,
  getDriftStopHookCommandString,
  getDriftStopHookScriptPath,
  getDriftUserPromptSubmitHookCommandString,
  getDriftUserPromptSubmitHookScriptPath,
} from './hook-paths.js';

/**
 * Install / inspect / uninstall the two drift hook entries that Nakiros owns
 * inside `~/.claude/settings.json`. We touch **hooks.Stop** and
 * **hooks.UserPromptSubmit**, matching only on the canonical Nakiros command
 * strings — every other matcher / entry / value is round-tripped verbatim so
 * other hooks (conversation-ingest Stop hook, dev scripts, etc.) coexist safely.
 */

const STOP_EVENT_KEY = 'Stop';
const USER_PROMPT_SUBMIT_EVENT_KEY = 'UserPromptSubmit';

// ---------------------------------------------------------------------------
// Settings JSON helpers (mirrors conversation-ingest/hook-installer.ts)
// ---------------------------------------------------------------------------

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
    // Corrupt — refuse to mutate, return empty parsed so callers can still diff.
  }
  return { exists: true, raw, parsed: {} };
}

interface MatcherGroup {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

function isNakirosDriftGroup(group: MatcherGroup, cmdString: string): boolean {
  if (!group || typeof group !== 'object') return false;
  if (!Array.isArray(group.hooks)) return false;
  return group.hooks.some((h) => h && typeof h === 'object' && h.command === cmdString);
}

function nakirosDriftGroup(cmdString: string): MatcherGroup {
  return { hooks: [{ type: 'command', command: cmdString }] };
}

/**
 * Pure function: add (or replace) the Nakiros drift hook for one event key.
 * All other groups for that event key are preserved.
 */
function withDriftHookForEvent(
  parsed: Record<string, unknown>,
  eventKey: string,
  cmdString: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...parsed };
  const hooksRaw = next.hooks;
  const hooks: Record<string, unknown> =
    hooksRaw && typeof hooksRaw === 'object' && !Array.isArray(hooksRaw)
      ? { ...(hooksRaw as Record<string, unknown>) }
      : {};
  const eventRaw = hooks[eventKey];
  const groups: MatcherGroup[] = Array.isArray(eventRaw)
    ? (eventRaw as MatcherGroup[]).filter((g) => g && typeof g === 'object')
    : [];
  const filtered = groups.filter((g) => !isNakirosDriftGroup(g, cmdString));
  filtered.push(nakirosDriftGroup(cmdString));
  hooks[eventKey] = filtered;
  next.hooks = hooks;
  return next;
}

/**
 * Pure function: remove the Nakiros drift hook for one event key.
 * Cleans up the event key (and the hooks object) when left empty.
 */
function withoutDriftHookForEvent(
  parsed: Record<string, unknown>,
  eventKey: string,
  cmdString: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...parsed };
  const hooksRaw = next.hooks;
  if (!hooksRaw || typeof hooksRaw !== 'object' || Array.isArray(hooksRaw)) return next;
  const hooks = { ...(hooksRaw as Record<string, unknown>) };
  const eventRaw = hooks[eventKey];
  if (!Array.isArray(eventRaw)) return next;
  const filtered = (eventRaw as MatcherGroup[]).filter((g) => !isNakirosDriftGroup(g, cmdString));
  if (filtered.length > 0) {
    hooks[eventKey] = filtered;
  } else {
    delete hooks[eventKey];
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

function writeScript(scriptPath: string, source: string): void {
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, source, 'utf8');
  try {
    chmodSync(scriptPath, 0o755);
  } catch {
    // Best-effort — `node` doesn't need the executable bit.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspect the current state of the drift hooks without touching anything.
 * Checks both the settings.json entries and the CJS scripts on disk.
 */
export function getDriftHookStatus(): DriftHookStatus {
  const settingsPath = getClaudeGlobalSettingsPath();
  const stopScriptPath = getDriftStopHookScriptPath();
  const upScriptPath = getDriftUserPromptSubmitHookScriptPath();
  const stopCmd = getDriftStopHookCommandString();
  const upCmd = getDriftUserPromptSubmitHookCommandString();

  const { exists, parsed } = readSettings(settingsPath);

  let stopHookPresent = false;
  let userPromptSubmitHookPresent = false;

  if (exists) {
    const hooksRaw = parsed.hooks;
    if (hooksRaw && typeof hooksRaw === 'object' && !Array.isArray(hooksRaw)) {
      const hooks = hooksRaw as Record<string, unknown>;

      const stopGroups = Array.isArray(hooks[STOP_EVENT_KEY])
        ? (hooks[STOP_EVENT_KEY] as MatcherGroup[])
        : [];
      stopHookPresent = stopGroups.some((g) => isNakirosDriftGroup(g, stopCmd));

      const upGroups = Array.isArray(hooks[USER_PROMPT_SUBMIT_EVENT_KEY])
        ? (hooks[USER_PROMPT_SUBMIT_EVENT_KEY] as MatcherGroup[])
        : [];
      userPromptSubmitHookPresent = upGroups.some((g) => isNakirosDriftGroup(g, upCmd));
    }
  }

  const scriptsMaterialized = existsSync(stopScriptPath) && existsSync(upScriptPath);

  return {
    installed: stopHookPresent && userPromptSubmitHookPresent && scriptsMaterialized,
    stopHookPresent,
    userPromptSubmitHookPresent,
    scriptsMaterialized,
    settingsPath,
    scriptPaths: { stop: stopScriptPath, userPromptSubmit: upScriptPath },
  };
}

/**
 * Build the diff payload shown in the UI before the user enables drift hooks.
 * Pure read — does not touch the filesystem.
 */
export function buildDriftHookDiff(): DriftHookDiff {
  const settingsPath = getClaudeGlobalSettingsPath();
  const { exists, raw, parsed } = readSettings(settingsPath);

  let next = withDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
  next = withDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());

  return {
    settingsPath,
    exists,
    current: exists ? raw : '',
    next: JSON.stringify(next, null, 2) + '\n',
    scriptPaths: {
      stop: getDriftStopHookScriptPath(),
      userPromptSubmit: getDriftUserPromptSubmitHookScriptPath(),
    },
  };
}

/**
 * Install both drift hooks. Idempotent — calling twice leaves exactly one
 * Nakiros entry per event key. Writes the two CJS scripts first (so Claude
 * Code never fires a hook that references a missing file), then mutates
 * `~/.claude/settings.json`.
 *
 * @returns The updated {@link DriftHookStatus}.
 * @throws On write failure so callers can surface the error to the UI.
 */
export function installDriftHook(): DriftHookStatus {
  // 1. Write CJS scripts first (defensive ordering).
  writeScript(getDriftStopHookScriptPath(), HOOK_STOP_SCRIPT_SOURCE);
  writeScript(getDriftUserPromptSubmitHookScriptPath(), HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE);

  // 2. Mutate settings.json — both hooks in one atomic write.
  const settingsPath = getClaudeGlobalSettingsPath();
  const { parsed } = readSettings(settingsPath);
  let next = withDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
  next = withDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());
  writeAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n');

  return getDriftHookStatus();
}

/**
 * Remove both drift hooks from `~/.claude/settings.json` and delete the two
 * CJS scripts. Idempotent — safe to call when nothing is installed.
 *
 * @returns The updated {@link DriftHookStatus}.
 */
export function uninstallDriftHook(): DriftHookStatus {
  const settingsPath = getClaudeGlobalSettingsPath();
  const { exists, parsed } = readSettings(settingsPath);

  if (exists) {
    let next = withoutDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
    next = withoutDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());
    writeAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n');
  }

  for (const scriptPath of [getDriftStopHookScriptPath(), getDriftUserPromptSubmitHookScriptPath()]) {
    if (existsSync(scriptPath)) {
      try {
        unlinkSync(scriptPath);
      } catch {
        // Non-fatal — a stale script is harmless once the settings entry is gone.
      }
    }
  }

  return getDriftHookStatus();
}
