import type { AgentProvider } from './preferences.js';
import type { ArtifactContext } from './artifact-review.js';

/** Whether a chat tab runs on the whole workspace (`global`) or a single repo (`repo`). */
export type ChatScopeMode = 'global' | 'repo';

/** Runtime status of a conversation participant. */
export type ConversationParticipantStatus = 'idle' | 'running' | 'waiting' | 'error';

/** Participant entry in a multi-agent conversation (agent + provider + session id). */
export interface ConversationParticipant {
  participantId: string;
  agentId: string;
  provider: AgentProvider;
  providerSessionId?: string | null;
  sessionId?: string | null;      // legacy alias for providerSessionId
  conversationId: string | null;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  summary: string;
  openQuestions: string[];
  lastUsedAt: string;
  status: ConversationParticipantStatus;
}

/** Scoped session state for a workspace tab: mode + anchor repo + active repos. */
export interface WorkspaceScopedSessionState {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
}

/** Persisted conversation record (stored under ~/.nakiros/) with participants and scope. */
export interface StoredConversation {
  id: string;
  sessionId: string;              // legacy compatibility field; orchestrator-backed conversations mirror id here
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
  repoPath: string;
  repoName: string;
  provider: AgentProvider;
  participants: ConversationParticipant[];
  title: string;
  agents: string[];
  createdAt: string;
  lastUsedAt: string;
  messages: unknown[];
}

/** Persisted tab state for the chat UI — one entry per open conversation tab. */
export interface StoredAgentTab {
  tabId: string;
  conversationId?: string;
  nakirosConversationId?: string;  // legacy alias for conversationId when restored from older tab state
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
  repoPath: string;
  provider: AgentProvider;
  participants: ConversationParticipant[];
  activeParticipantId?: string;
  title: string;
  providerSessionId?: string;
  sessionId?: string;             // legacy alias for providerSessionId
  artifactContext?: ArtifactContext | null;
}

/** Persisted tab layout for a single workspace: active tab id + ordered tabs. */
export interface StoredAgentTabsState {
  workspaceId: string;
  activeTabId: string | null;
  tabs: StoredAgentTab[];
}

/** Request sent to the daemon to run an agent turn on a workspace/repo scope. */
export interface AgentRunRequest extends WorkspaceScopedSessionState {
  message: string;
  provider?: AgentProvider;
  providerSessionId?: string | null;
  sessionId?: string | null;       // legacy alias for providerSessionId
  conversationId?: string | null;  // conv_xxx — identifies the nakiros conversation
  agentId?: string | null;         // 'nakiros', 'architect', 'pm', etc.
  participantId?: string | null;
  additionalDirs?: string[];
}
