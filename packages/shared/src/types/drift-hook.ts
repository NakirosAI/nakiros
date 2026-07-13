/**
 * Types for the drift-hook module — opt-in pair of Stop + UserPromptSubmit
 * hooks that call the local Nakiros daemon at `/api/drift?session=<id>` and
 * surface a banner / additionalContext when a conversation is drifting.
 *
 * Two hooks are managed together as a single unit: both are either installed
 * or uninstalled. Their CJS scripts land under `~/.nakiros/drift/`.
 */

export type DriftHookProvider = 'claude' | 'codex';

/** Status of the Argos hook pair for one installed agent. */
export interface DriftHookTargetStatus {
  provider: DriftHookProvider;
  installed: boolean;
  stopHookPresent: boolean;
  userPromptSubmitHookPresent: boolean;
  settingsPath: string;
  /** Codex asks the user to review non-managed hooks before trusting them. */
  requiresTrustReview: boolean;
}

/** Full status of the drift hook installation as reported to the UI. */
export interface DriftHookStatus {
  /** True when every detected agent has both hooks and both scripts exist. */
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
  /** Per-agent registration status. Claude-only and Codex-only setups remain valid. */
  targets: DriftHookTargetStatus[];
}

export interface DriftHookTargetDiff {
  provider: DriftHookProvider;
  settingsPath: string;
  exists: boolean;
  current: string;
  next: string;
  requiresTrustReview: boolean;
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
  /** Exact configuration mutation for each detected agent. */
  targets: DriftHookTargetDiff[];
}
