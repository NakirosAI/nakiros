/**
 * Identifier for an editor/agent environment the onboarding can install into.
 * Same set as {@link AgentEnvironmentId} (electron.ts) — kept distinct for now
 * because it is consumed only by the onboarding flow (detect + install layout).
 */
export type EditorId = 'claude' | 'cursor' | 'codex';

/**
 * One row of the onboarding "detected editors" panel: presence + label + the
 * directory the installer will populate when the user opts in.
 */
export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}

/**
 * Progress event broadcast on the `onboarding:progress` channel during
 * `installNakiros`. Each step emits one event — the UI renders a live install
 * log. `error` is set when `done` is `false` because the step failed.
 */
export interface OnboardingProgressEvent {
  label: string;
  done: boolean;
  error?: string;
}

/**
 * Result returned by `onboarding:install`. Errors are collected (not thrown)
 * so the UI can keep a per-step status and show what failed without aborting
 * the whole flow.
 */
export interface OnboardingInstallResult {
  success: boolean;
  errors: string[];
}
