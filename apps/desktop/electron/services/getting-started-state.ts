import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type {
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  WorkspaceGettingStartedStepState,
} from '@nakiros/shared';
import { toWorkspaceSlug } from './ticket-storage.js';

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getWorkspaceRuntimeDir(workspaceName: string): string {
  return join(homedir(), '.nakiros', 'workspaces', toWorkspaceSlug(workspaceName));
}

function getStatePath(workspaceName: string): string {
  return join(getWorkspaceRuntimeDir(workspaceName), 'state', 'getting-started.json');
}

function getContextDir(workspaceName: string): string {
  return join(getWorkspaceRuntimeDir(workspaceName), 'context');
}

function getConfidenceDir(workspaceName: string): string {
  return join(getWorkspaceRuntimeDir(workspaceName), 'reports', 'confidence');
}

// ─── Default state factory ────────────────────────────────────────────────────

function emptyStep(): WorkspaceGettingStartedStepState {
  return { completedAt: null, launchedConversationId: null };
}

function defaultState(): WorkspaceGettingStartedState {
  return {
    step1: emptyStep(),
    step2: emptyStep(),
    step3: emptyStep(),
    brownfieldMode: false,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function getGettingStartedState(workspaceName: string): WorkspaceGettingStartedState {
  const statePath = getStatePath(workspaceName);
  if (!existsSync(statePath)) return defaultState();
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as WorkspaceGettingStartedState;
  } catch {
    return defaultState();
  }
}

export function saveGettingStartedState(workspaceName: string, state: WorkspaceGettingStartedState): void {
  const stateDir = join(getWorkspaceRuntimeDir(workspaceName), 'state');
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(getStatePath(workspaceName), JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Brownfield detection ─────────────────────────────────────────────────────

/**
 * Returns true if any repo already has _nakiros/architecture.md,
 * meaning Step 1 should be displayed as inter-repo context generation.
 */
export function detectBrownfield(repoPaths: string[]): boolean {
  return repoPaths.some((repoPath) => existsSync(join(repoPath, '_nakiros', 'architecture.md')));
}

// ─── Completion detection ─────────────────────────────────────────────────────

/**
 * Step 1: complete when global-context.md, inter-repo.md, or product-context.md
 * exists in the workspace context directory.
 */
function checkStep1Complete(workspaceName: string): boolean {
  const contextDir = getContextDir(workspaceName);
  if (!existsSync(contextDir)) return false;
  const CONTEXT_FILES = ['global-context.md', 'inter-repo.md', 'product-context.md'];
  return CONTEXT_FILES.some((filename) => existsSync(join(contextDir, filename)));
}

/**
 * Step 2: complete when at least one JSON report exists in the confidence directory.
 */
function checkStep2Complete(workspaceName: string): boolean {
  const confidenceDir = getConfidenceDir(workspaceName);
  if (!existsSync(confidenceDir)) return false;
  try {
    return readdirSync(confidenceDir).some((file) => file.endsWith('.json'));
  } catch {
    return false;
  }
}

// ─── Combined context for IPC ─────────────────────────────────────────────────

/**
 * Returns the full Getting Started context needed by the renderer:
 * persisted state + brownfield detection + live completion checks.
 */
export function getGettingStartedContext(
  workspaceName: string,
  repoPaths: string[],
): WorkspaceGettingStartedContext {
  const state = getGettingStartedState(workspaceName);
  const brownfieldMode = detectBrownfield(repoPaths);
  const step1Complete = checkStep1Complete(workspaceName) || state.step1.completedAt !== null;
  const step2Complete = checkStep2Complete(workspaceName) || state.step2.completedAt !== null;

  // Keep the persisted brownfieldMode in sync if it changes.
  if (state.brownfieldMode !== brownfieldMode) {
    saveGettingStartedState(workspaceName, { ...state, brownfieldMode });
  }

  return { state, brownfieldMode, step1Complete, step2Complete };
}
