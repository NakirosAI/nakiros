import { homedir } from 'node:os';
import { join } from 'node:path';

import { nakirosFile } from '../../utils/nakiros-dir.js';

/**
 * Directory and file paths for the drift hook pipeline.
 * All scripts land under `~/.nakiros/drift/`.
 *
 * `getClaudeGlobalSettingsPath` is re-exported from this module so callers
 * that only need drift paths don't have to import from conversation-ingest.
 */

const DRIFT_DIR_NAME = 'drift';
const DRIFT_STOP_HOOK_FILENAME = 'hook-stop.cjs';
const DRIFT_USER_PROMPT_SUBMIT_HOOK_FILENAME = 'hook-userpromptsubmit.cjs';
const DRIFT_ADJUDICATION_STORE_FILENAME = 'adjudications.json';

/** Absolute path of the `~/.nakiros/drift/` directory (not auto-created here). */
export function getDriftHookDir(): string {
  return nakirosFile(DRIFT_DIR_NAME);
}

/** Absolute path of `~/.nakiros/drift/hook-stop.cjs`. */
export function getDriftStopHookScriptPath(): string {
  return join(getDriftHookDir(), DRIFT_STOP_HOOK_FILENAME);
}

/** Absolute path of `~/.nakiros/drift/hook-userpromptsubmit.cjs`. */
export function getDriftUserPromptSubmitHookScriptPath(): string {
  return join(getDriftHookDir(), DRIFT_USER_PROMPT_SUBMIT_HOOK_FILENAME);
}

/** Persistent Argos decisions and pending adjudications. */
export function getDriftAdjudicationStorePath(): string {
  return join(getDriftHookDir(), DRIFT_ADJUDICATION_STORE_FILENAME);
}

/**
 * The exact command string written into `hooks.Stop[].hooks[].command` in
 * `~/.claude/settings.json`. Uses an absolute path so Claude Code can
 * resolve it regardless of the working directory.
 */
export function getDriftStopHookCommandString(): string {
  return `node "${join(homedir(), '.nakiros', DRIFT_DIR_NAME, DRIFT_STOP_HOOK_FILENAME)}"`;
}

/**
 * The exact command string written into
 * `hooks.UserPromptSubmit[].hooks[].command` in `~/.claude/settings.json`.
 */
export function getDriftUserPromptSubmitHookCommandString(): string {
  return `node "${join(homedir(), '.nakiros', DRIFT_DIR_NAME, DRIFT_USER_PROMPT_SUBMIT_HOOK_FILENAME)}"`;
}

/**
 * Absolute path of the user-global Claude Code settings file that both hook
 * entries are registered in. Mirrors
 * `conversation-ingest/paths.ts#getClaudeGlobalSettingsPath` — both point to
 * the same file, so we keep the two modules independent but consistent.
 */
export function getClaudeGlobalSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/** Absolute path of the user-global Codex hooks configuration. */
export function getCodexGlobalHooksPath(): string {
  return join(homedir(), '.codex', 'hooks.json');
}
