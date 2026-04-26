import type { AgentProvider } from './preferences.js';

/** Supported editor/agent integrations the Nakiros skill-command installer targets. */
export type AgentEnvironmentId = 'cursor' | 'codex' | 'claude';

/** Install status for one environment in a single repo (marker presence + command counts). */
export interface AgentEnvironmentStatus {
  id: AgentEnvironmentId;
  label: string;
  targetPath: string;
  markerExists: boolean;
  installedCount: number;
  totalExpected: number;
}

/** Aggregate install status across every environment for one repo. */
export interface AgentInstallStatus {
  repoPath: string;
  environments: AgentEnvironmentStatus[];
}

/** Request payload for the installer IPC call — target repo + environments. */
export interface AgentInstallRequest {
  repoPath: string;
  targets: AgentEnvironmentId[];
  force?: boolean;
}

/** Summary of what the installer actually wrote / overwrote on disk after a run. */
export interface AgentInstallSummary {
  repoPath: string;
  targets: AgentEnvironmentId[];
  commandFilesCopied: number;
  commandFilesOverwritten: number;
  runtimeFilesCopied: number;
  runtimeFilesOverwritten: number;
  workspaceDirsCreated: number;
  gitignorePatched: boolean;
}

/**
 * Notification payload pushed when an agent run finishes outside the focused
 * window. Surfaced by `showAgentRunNotification` so the UI can badge the
 * topbar / runs center even when the user is on another screen.
 */
export interface AgentRunNotificationPayload {
  workspaceId: string;
  workspaceName?: string;
  conversationId?: string | null;
  tabId?: string | null;
  conversationTitle?: string;
  provider?: AgentProvider;
  durationSeconds: number;
}

/**
 * Payload emitted by `onOpenAgentRunChat` when the user clicks a notification
 * — tells the UI which workspace/conversation to open in the chat panel.
 */
export interface OpenAgentRunChatPayload {
  workspaceId: string;
  conversationId?: string | null;
  tabId?: string | null;
  eventId?: string;
}
