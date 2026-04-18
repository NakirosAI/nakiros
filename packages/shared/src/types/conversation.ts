import type { AgentProvider } from './preferences.js';
import type { ArtifactContext } from './artifact-review.js';

export type ChatScopeMode = 'global' | 'repo';
export type ConversationParticipantStatus = 'idle' | 'running' | 'waiting' | 'error';

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

export interface WorkspaceScopedSessionState {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
}

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

export interface StoredAgentTabsState {
  workspaceId: string;
  activeTabId: string | null;
  tabs: StoredAgentTab[];
}

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
