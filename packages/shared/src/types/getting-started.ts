import type { ArtifactContext } from './artifact-review.js';

export interface WorkspaceGettingStartedStepState {
  completedAt: string | null;
  launchedConversationId: string | null;
}

export interface WorkspaceGettingStartedState {
  step1: WorkspaceGettingStartedStepState;
  step2: WorkspaceGettingStartedStepState;
  step3: WorkspaceGettingStartedStepState;
  brownfieldMode: boolean;
}

/** Combined payload returned by workspace:getStartedContext IPC call. */
export interface WorkspaceGettingStartedContext {
  state: WorkspaceGettingStartedState;
  /** True if any workspace repo already has _nakiros/architecture.md. */
  brownfieldMode: boolean;
  /** True if step 1 completion evidence is present in workspace runtime data. */
  step1Complete: boolean;
  /** True if step 2 completion evidence is present in workspace runtime data. */
  step2Complete: boolean;
}

/** Payload sent from the renderer to open a new pre-configured chat tab. */
export interface OnboardingChatLaunchRequest {
  /** Unique ID to deduplicate repeated renders. */
  requestId: string;
  /** Display title for the new chat tab. */
  title: string;
  /** Agent definition id (e.g. 'architect', 'pm'). */
  agentId: string;
  /** Slash command to send immediately (e.g. '/nak-workflow-generate-context'). */
  command: string;
  /** Optional full message to send (overrides `command` as the sent content). `command` is still used for input display. */
  initialMessage?: string;
  /** Optional artifact context used to constrain a document/backlog editing conversation. */
  artifactContext?: ArtifactContext;
  /** Onboarding step that triggered this launch (1 | 2 | 3). Optional for non-onboarding launches. */
  step?: 1 | 2 | 3;
}
