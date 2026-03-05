import type { AgentProvider } from './preferences.js';

export interface StoredConversation {
  id: string;
  sessionId: string;
  repoPath: string;
  repoName: string;
  provider: AgentProvider;
  workspaceId: string;
  title: string;
  agents: string[];
  createdAt: string;
  lastUsedAt: string;
  messages: unknown[];
}

export interface StoredAgentTab {
  tabId: string;
  conversationId?: string;
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

