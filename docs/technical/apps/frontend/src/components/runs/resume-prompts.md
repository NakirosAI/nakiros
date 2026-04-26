# resume-prompts.ts

**Path:** `apps/frontend/src/components/runs/resume-prompts.ts`

Synthetic continuation prompts sent to the agent when the user clicks the **Reprendre** button on a run that was rehydrated after a daemon reboot. These strings are sent to the agent (not displayed in the UI), so they live in English regardless of the locale — Claude consumes English instructions for every kind. The button label itself goes through i18n (`runs:resume`).

## Exports

### `RESUME_PROMPTS`

```ts
export const RESUME_PROMPTS: {
  audit: string;
  fix: string;
  create: string;
  eval: string;
} = {
  audit: 'Resume the audit. Re-emit any partial findings from where you stopped, then finish the report.',
  fix: 'Continue editing the skill where you left off. Pick up exactly where the interrupted turn stopped.',
  create: 'Continue building the skill where you left off. Pick up exactly where the interrupted turn stopped.',
  eval: 'Continue answering the eval prompt. Pick up exactly where the interrupted turn stopped.',
}
```

Per-kind continuation prompts. The view's "Reprendre" handler picks the right key and forwards the prompt via `sendXxxUserMessage(runId, RESUME_PROMPTS.kind)`.

### `type ResumePromptKind`

```ts
export type ResumePromptKind = keyof typeof RESUME_PROMPTS;
```

Discriminator union of the supported kinds — useful at the call site when the kind is dynamic.
