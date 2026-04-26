/**
 * Synthetic continuation prompts sent to the agent when the user clicks
 * "Reprendre" on a run that was rehydrated after a daemon reboot.
 *
 * These strings are sent **to the agent** (not displayed), so they live in
 * English regardless of the UI locale — Claude consumes English instructions
 * for every run kind. The UI label of the button itself goes through i18n
 * (`runs:resume`).
 */
export const RESUME_PROMPTS = {
  audit: 'Resume the audit. Re-emit any partial findings from where you stopped, then finish the report.',
  fix: 'Continue editing the skill where you left off. Pick up exactly where the interrupted turn stopped.',
  create: 'Continue building the skill where you left off. Pick up exactly where the interrupted turn stopped.',
  eval: 'Continue answering the eval prompt. Pick up exactly where the interrupted turn stopped.',
} as const;

export type ResumePromptKind = keyof typeof RESUME_PROMPTS;
