/**
 * Types for the drift-hook module — opt-in pair of Stop + UserPromptSubmit
 * hooks that call the local Nakiros daemon at `/api/drift?session=<id>` and
 * surface a banner / additionalContext when a conversation is drifting.
 *
 * Two hooks are managed together as a single unit: both are either installed
 * or uninstalled. Their CJS scripts land under `~/.nakiros/drift/`.
 */

/** Full status of the drift hook installation as reported to the UI. */
export interface DriftHookStatus {
  /** True when both hooks are present in settings.json AND both scripts are materialized on disk. */
  installed: boolean;
  /** Whether the Stop hook command string is found in `~/.claude/settings.json`. */
  stopHookPresent: boolean;
  /** Whether the UserPromptSubmit hook command string is found in `~/.claude/settings.json`. */
  userPromptSubmitHookPresent: boolean;
  /** Whether both CJS script files exist on disk under `~/.nakiros/drift/`. */
  scriptsMaterialized: boolean;
  /** Absolute path of the user-global Claude settings file the hooks are registered in. */
  settingsPath: string;
  /** Absolute paths of the two hook scripts. */
  scriptPaths: { stop: string; userPromptSubmit: string };
}

/**
 * Diff payload shown to the user before they enable drift hooks. Lets the UI
 * render the exact `~/.claude/settings.json` mutation before the user consents.
 */
export interface DriftHookDiff {
  /** Absolute path of the user-global settings file we will mutate. */
  settingsPath: string;
  /** Whether `settings.json` currently exists on disk. */
  exists: boolean;
  /** Current settings.json content (empty string when `exists === false`). */
  current: string;
  /** Settings.json content after install — what `installDriftHook()` will write. */
  next: string;
  /** Absolute paths of the two CJS scripts that will be written. */
  scriptPaths: { stop: string; userPromptSubmit: string };
}
