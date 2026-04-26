# onboarding.ts

**Path:** `packages/shared/src/types/onboarding.ts`

Editor detection + install-progress types driving the `onboarding:*` IPC channels. Shared so the daemon (handler + installer service) and the frontend (Onboarding view) work off the same shapes.

## Exports

### `type EditorId`

Identifier for an editor/agent environment the onboarding can install into. Same set as `AgentEnvironmentId` (electron.ts) — kept distinct for now because it is consumed only by the onboarding flow.

```ts
export type EditorId = 'claude' | 'cursor' | 'codex'
```

### `interface DetectedEditor`

One row of the onboarding "detected editors" panel: presence + label + the directory the installer will populate when the user opts in.

```ts
export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}
```

### `interface OnboardingProgressEvent`

Progress event broadcast on the `onboarding:progress` channel during `installNakiros`. Each step emits one event — the UI renders a live install log. `error` is set when `done` is `false` because the step failed.

```ts
export interface OnboardingProgressEvent {
  label: string;
  done: boolean;
  error?: string;
}
```

### `interface OnboardingInstallResult`

Result returned by `onboarding:install`. Errors are collected (not thrown) so the UI can keep a per-step status and show what failed without aborting the whole flow.

```ts
export interface OnboardingInstallResult {
  success: boolean;
  errors: string[];
}
```
