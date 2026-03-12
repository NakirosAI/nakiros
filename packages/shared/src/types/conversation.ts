import type { AgentProvider } from './preferences.js';

export type ChatScopeMode = 'global' | 'repo';
export type ConversationParticipantStatus = 'idle' | 'running' | 'waiting' | 'error';

export interface ConversationParticipant {
  participantId: string;
  agentId: string;
  provider: AgentProvider;
  sessionId: string | null;
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
  sessionId: string;
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
  sessionId?: string;
}

export interface StoredAgentTabsState {
  workspaceId: string;
  activeTabId: string | null;
  tabs: StoredAgentTab[];
}

export interface AgentRunRequest extends WorkspaceScopedSessionState {
  message: string;
  provider?: AgentProvider;
  sessionId?: string | null;
  participantId?: string | null;
  additionalDirs?: string[];
}
