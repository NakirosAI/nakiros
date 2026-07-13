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

import type {
  DriftHookDiff,
  DriftHookProvider,
  DriftHookStatus,
  DriftHookTargetStatus,
} from '@nakiros/shared';

import { HOOK_STOP_SCRIPT_SOURCE, HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE } from './hook-script.js';
import {
  getClaudeGlobalSettingsPath,
  getCodexGlobalHooksPath,
  getDriftStopHookCommandString,
  getDriftStopHookScriptPath,
  getDriftUserPromptSubmitHookCommandString,
  getDriftUserPromptSubmitHookScriptPath,
} from './hook-paths.js';

/**
 * Install / inspect / uninstall the two Argos drift hook entries that Nakiros
 * owns inside the detected Claude and Codex configurations. We touch **hooks.Stop** and
 * **hooks.UserPromptSubmit**, matching only on the canonical Nakiros command
 * strings — every other matcher / entry / value is round-tripped verbatim so
 * other hooks (conversation-ingest Stop hook, dev scripts, etc.) coexist safely.
 */

const STOP_EVENT_KEY = 'Stop';
const USER_PROMPT_SUBMIT_EVENT_KEY = 'UserPromptSubmit';

interface HookTarget {
  provider: DriftHookProvider;
  settingsPath: string;
  requiresTrustReview: boolean;
}

function hookTargets(): HookTarget[] {
  const candidates: HookTarget[] = [
    {
      provider: 'claude',
      settingsPath: getClaudeGlobalSettingsPath(),
      requiresTrustReview: false,
    },
    {
      provider: 'codex',
      settingsPath: getCodexGlobalHooksPath(),
      requiresTrustReview: true,
    },
  ];
  const detected = candidates.filter(
    (target) => existsSync(target.settingsPath) || existsSync(dirname(target.settingsPath)),
  );
  // Preserve the historical Claude-first behaviour on a fresh machine.
  return detected.length > 0 ? detected : candidates.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Settings JSON helpers (mirrors conversation-ingest/hook-installer.ts)
// ---------------------------------------------------------------------------

function readSettings(path: string): {
  exists: boolean;
  valid: boolean;
  raw: string;
  parsed: Record<string, unknown>;
} {
  if (!existsSync(path)) {
    return { exists: false, valid: true, raw: '', parsed: {} };
  }
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { exists: false, valid: false, raw: '', parsed: {} };
  }
  if (raw.trim().length === 0) {
    return { exists: true, valid: true, raw, parsed: {} };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { exists: true, valid: true, raw, parsed: parsed as Record<string, unknown> };
    }
  } catch {
    // Corrupt — refuse to mutate, return empty parsed so callers can still diff.
  }
  return { exists: true, valid: false, raw, parsed: {} };
}

function readMutableSettings(path: string): ReturnType<typeof readSettings> {
  const settings = readSettings(path);
  if (!settings.valid) {
    throw new Error(`Refusing to overwrite invalid hook configuration: ${path}`);
  }
  return settings;
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

function scriptMatches(scriptPath: string, source: string): boolean {
  try {
    return readFileSync(scriptPath, 'utf8') === source;
  } catch {
    return false;
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
  const stopScriptPath = getDriftStopHookScriptPath();
  const upScriptPath = getDriftUserPromptSubmitHookScriptPath();
  const stopCmd = getDriftStopHookCommandString();
  const upCmd = getDriftUserPromptSubmitHookCommandString();

  const targets: DriftHookTargetStatus[] = hookTargets().map((target) => {
    const { exists, parsed } = readSettings(target.settingsPath);
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
    return {
      ...target,
      installed: stopHookPresent && userPromptSubmitHookPresent,
      stopHookPresent,
      userPromptSubmitHookPresent,
    };
  });

  const scriptsMaterialized =
    scriptMatches(stopScriptPath, HOOK_STOP_SCRIPT_SOURCE) &&
    scriptMatches(upScriptPath, HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE);
  const primary = targets[0]!;

  return {
    installed: targets.every((target) => target.installed) && scriptsMaterialized,
    stopHookPresent: primary.stopHookPresent,
    userPromptSubmitHookPresent: primary.userPromptSubmitHookPresent,
    scriptsMaterialized,
    settingsPath: primary.settingsPath,
    scriptPaths: { stop: stopScriptPath, userPromptSubmit: upScriptPath },
    targets,
  };
}

/**
 * Build the diff payload shown in the UI before the user enables drift hooks.
 * Pure read — does not touch the filesystem.
 */
export function buildDriftHookDiff(): DriftHookDiff {
  const targets = hookTargets().map((target) => {
    const { exists, raw, parsed } = readMutableSettings(target.settingsPath);
    let next = withDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
    next = withDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());
    return {
      ...target,
      exists,
      current: exists ? raw : '',
      next: JSON.stringify(next, null, 2) + '\n',
    };
  });
  const primary = targets[0]!;

  return {
    settingsPath: primary.settingsPath,
    exists: primary.exists,
    current: primary.current,
    next: primary.next,
    scriptPaths: {
      stop: getDriftStopHookScriptPath(),
      userPromptSubmit: getDriftUserPromptSubmitHookScriptPath(),
    },
    targets,
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

  // 2. Register the pair for every locally installed supported agent.
  for (const target of hookTargets()) {
    const { parsed } = readMutableSettings(target.settingsPath);
    let next = withDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
    next = withDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());
    writeAtomic(target.settingsPath, JSON.stringify(next, null, 2) + '\n');
  }

  return getDriftHookStatus();
}

/**
 * Remove both drift hooks from `~/.claude/settings.json` and delete the two
 * CJS scripts. Idempotent — safe to call when nothing is installed.
 *
 * @returns The updated {@link DriftHookStatus}.
 */
export function uninstallDriftHook(): DriftHookStatus {
  for (const target of hookTargets()) {
    const { exists, parsed } = readMutableSettings(target.settingsPath);
    if (!exists) continue;
    let next = withoutDriftHookForEvent(parsed, STOP_EVENT_KEY, getDriftStopHookCommandString());
    next = withoutDriftHookForEvent(next, USER_PROMPT_SUBMIT_EVENT_KEY, getDriftUserPromptSubmitHookCommandString());
    writeAtomic(target.settingsPath, JSON.stringify(next, null, 2) + '\n');
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
