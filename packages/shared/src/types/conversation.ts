import type { AgentProvider } from './preferences.js';

export type ChatScopeMode = 'global' | 'repo';

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
  additionalDirs?: string[];
}
