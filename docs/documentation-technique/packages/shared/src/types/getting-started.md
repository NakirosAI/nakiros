# getting-started.ts

**Path:** `packages/shared/src/types/getting-started.ts`

Types powering the onboarding checklist: per-step persisted state, the combined payload returned by `workspace:getStartedContext`, and the launch payload used to open a pre-configured chat tab.

## Exports

### `interface WorkspaceGettingStartedStepState`

Per-step state for the onboarding checklist (completion timestamp + launched conversation id).

```ts
export interface WorkspaceGettingStartedStepState {
  completedAt: string | null;
  launchedConversationId: string | null;
}
```

### `interface WorkspaceGettingStartedState`

Full onboarding checklist state persisted per workspace.

```ts
export interface WorkspaceGettingStartedState {
  step1: WorkspaceGettingStartedStepState;
  step2: WorkspaceGettingStartedStepState;
  step3: WorkspaceGettingStartedStepState;
  brownfieldMode: boolean;
}
```

### `interface WorkspaceGettingStartedContext`

Combined payload returned by workspace:getStartedContext IPC call — persisted state + derived flags.

```ts
export interface WorkspaceGettingStartedContext {
  state: WorkspaceGettingStartedState;
  brownfieldMode: boolean;
  step1Complete: boolean;
  step2Complete: boolean;
}
```

### `interface OnboardingChatLaunchRequest`

Payload sent from the renderer to open a new pre-configured chat tab.

```ts
export interface OnboardingChatLaunchRequest {
  requestId: string;
  title: string;
  agentId: string;
  command: string;
  initialMessage?: string;
  artifactContext?: ArtifactContext;
  step?: 1 | 2 | 3;
}
```
