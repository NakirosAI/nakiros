import type {
  ArtifactContext,
  AgentProvider,
  ChatScopeMode,
  ConversationParticipant,
  StoredAgentTab,
  StoredAgentTabsState,
  StoredConversation,
} from '@nakiros/shared';
import {
  type AgentTabState,
  isAgentProvider,
  mergeParticipants,
  rawToUiMessages,
} from './agent-panel-utils.js';

export interface BuildTabArgs {
  id?: string;
  title?: string;
  mode?: ChatScopeMode;
  anchorRepoPath?: string;
  activeRepoPaths?: string[];
  lastResolvedRepoMentions?: string[];
  repoPath?: string;
  provider: AgentProvider;
  participants?: ConversationParticipant[];
  artifactContext?: ArtifactContext | null;
  activeParticipantId?: string | null;
  providerSessionId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  nakirosConversationId?: string | null;
  messages?: AgentTabState['messages'];
}

export interface BuildTabDeps {
  defaultTabTitle: string;
  getDefaultRepoPath: () => string;
  makeTabId: () => string;
  resolveRepoPath: (candidate: string | null | undefined) => string;
}

export function buildTab(args: BuildTabArgs, deps: BuildTabDeps): AgentTabState {
  const anchorRepoPath = deps.resolveRepoPath(args.anchorRepoPath ?? args.repoPath ?? deps.getDefaultRepoPath());
  const activeRepoPaths = Array.from(new Set(
    (args.activeRepoPaths ?? [])
      .map((path) => deps.resolveRepoPath(path))
      .filter((path) => path.length > 0),
  ));
  return {
    id: args.id ?? deps.makeTabId(),
    title: args.title ?? deps.defaultTabTitle,
    mode: args.mode ?? 'global',
    anchorRepoPath,
    activeRepoPaths,
    lastResolvedRepoMentions: args.lastResolvedRepoMentions ?? [],
    repoPath: anchorRepoPath,
    provider: args.provider,
    participants: args.participants ?? [],
    artifactContext: args.artifactContext ?? null,
    activeParticipantId: args.activeParticipantId ?? null,
    input: '',
    messages: args.messages ?? [],
    activeRunId: null,
    runningCommand: null,
    sessionId: args.providerSessionId ?? args.sessionId ?? null,
    conversationId: args.conversationId ?? null,
    nakirosConversationId: args.nakirosConversationId ?? null,
    pendingTitle: null,
    hasUnread: false,
    hasRunCompletionNotice: false,
  };
}

export interface CreateParticipantArgs {
  agentId: string;
  provider: AgentProvider;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  providerSessionId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  summary?: string;
  openQuestions?: string[];
  lastUsedAt?: string;
  status?: ConversationParticipant['status'];
  makeParticipantId: (agentId: string, provider: AgentProvider) => string;
}

export function createParticipant(args: CreateParticipantArgs): ConversationParticipant {
  const providerSessionId = args.providerSessionId ?? args.sessionId ?? null;
  return {
    participantId: args.makeParticipantId(args.agentId, args.provider),
    agentId: args.agentId,
    provider: args.provider,
    providerSessionId,
    sessionId: providerSessionId,
    conversationId: args.conversationId ?? null,
    anchorRepoPath: args.anchorRepoPath,
    activeRepoPaths: args.activeRepoPaths,
    summary: args.summary ?? '',
    openQuestions: args.openQuestions ?? [],
    lastUsedAt: args.lastUsedAt ?? new Date().toISOString(),
    status: args.status ?? 'idle',
  };
}

export interface CreateConversationFromTabArgs {
  tab: AgentTabState;
  sessionId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  defaultTabTitle: string;
  getRepoName: (repoPath: string) => string;
  explicitTitle?: string;
}

export function createConversationFromTab(args: CreateConversationFromTabArgs): StoredConversation {
  const title = args.explicitTitle ?? args.tab.pendingTitle ?? args.tab.title ?? args.defaultTabTitle;
  const now = new Date().toISOString();
  return {
    id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    sessionId: args.sessionId,
    workspaceId: args.workspaceId,
    workspaceSlug: args.workspaceSlug,
    workspaceName: args.workspaceName ?? args.workspaceId,
    mode: args.tab.mode,
    anchorRepoPath: args.tab.anchorRepoPath,
    activeRepoPaths: args.tab.activeRepoPaths,
    lastResolvedRepoMentions: args.tab.lastResolvedRepoMentions,
    repoPath: args.tab.anchorRepoPath,
    repoName: args.getRepoName(args.tab.anchorRepoPath),
    provider: args.tab.provider,
    participants: args.tab.participants,
    title,
    agents: args.tab.participants.map((participant) => participant.agentId),
    createdAt: now,
    lastUsedAt: now,
    messages: [],
  };
}

export function serializeAgentTabsState(args: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  activeTabId: string | null;
  tabs: AgentTabState[];
}): StoredAgentTabsState {
  return {
    workspaceId: args.workspaceId,
    activeTabId: args.activeTabId,
    tabs: args.tabs.map((tab) => ({
      tabId: tab.id,
      conversationId: tab.conversationId ?? undefined,
      nakirosConversationId: tab.nakirosConversationId ?? undefined,
      workspaceId: args.workspaceId,
      workspaceSlug: args.workspaceSlug,
      workspaceName: args.workspaceName ?? args.workspaceId,
      mode: tab.mode,
      anchorRepoPath: tab.anchorRepoPath,
      activeRepoPaths: tab.activeRepoPaths,
      lastResolvedRepoMentions: tab.lastResolvedRepoMentions,
      repoPath: tab.anchorRepoPath,
      provider: tab.provider,
      participants: tab.participants,
      activeParticipantId: tab.activeParticipantId ?? undefined,
      title: tab.title,
      providerSessionId: tab.sessionId ?? undefined,
      sessionId: tab.sessionId ?? undefined,
      artifactContext: tab.artifactContext ?? undefined,
    })),
  };
}

export function buildRecoveredConversations(args: {
  storedConversations: StoredConversation[];
  storedTabs: StoredAgentTabsState | null;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  defaultTabTitle: string;
  preferredProvider: AgentProvider;
  resolveRepoPath: (candidate: string | null | undefined) => string;
  getRepoName: (repoPath: string) => string;
}): {
  conversations: StoredConversation[];
  recoveredConversations: StoredConversation[];
} {
  let mergedConversations = [...args.storedConversations];
  const conversationById = new Map(mergedConversations.map((conv) => [conv.id, conv]));
  const recoveredConversations: StoredConversation[] = [];

  for (const storedTab of args.storedTabs?.tabs ?? []) {
    const missingConversationId = storedTab.conversationId;
    if (!missingConversationId) continue;
    if (conversationById.has(missingConversationId)) continue;
    if (storedTab.nakirosConversationId && conversationById.has(storedTab.nakirosConversationId)) continue;

    const repoPath = args.resolveRepoPath(storedTab.repoPath);
    const now = new Date().toISOString();
    const recoveredConversation: StoredConversation = {
      id: missingConversationId,
      sessionId: storedTab.providerSessionId ?? storedTab.sessionId ?? `pending-${storedTab.tabId}`,
      workspaceId: args.workspaceId,
      workspaceSlug: args.workspaceSlug,
      workspaceName: args.workspaceName ?? args.workspaceId,
      mode: storedTab.mode ?? 'global',
      anchorRepoPath: args.resolveRepoPath(storedTab.anchorRepoPath ?? repoPath),
      activeRepoPaths: (storedTab.activeRepoPaths ?? []).map((path) => args.resolveRepoPath(path)),
      lastResolvedRepoMentions: storedTab.lastResolvedRepoMentions ?? [],
      repoPath,
      repoName: args.getRepoName(repoPath),
      provider: isAgentProvider(storedTab.provider) ? storedTab.provider : args.preferredProvider,
      participants: storedTab.participants ?? [],
      title: storedTab.title || args.defaultTabTitle,
      agents: (storedTab.participants ?? []).map((participant) => participant.agentId),
      createdAt: now,
      lastUsedAt: now,
      messages: [],
    };
    recoveredConversations.push(recoveredConversation);
    conversationById.set(missingConversationId, recoveredConversation);
  }

  if (recoveredConversations.length > 0) {
    mergedConversations = [...mergedConversations, ...recoveredConversations].sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
    );
  }

  return {
    conversations: mergedConversations,
    recoveredConversations,
  };
}

export function restoreTabsFromStorage(args: {
  storedTabs: StoredAgentTabsState | null;
  conversations: StoredConversation[];
  preferredProvider: AgentProvider;
  defaultTabTitle: string;
  resolveRepoPath: (candidate: string | null | undefined) => string;
  buildTab: (args: BuildTabArgs) => AgentTabState;
}): AgentTabState[] {
  const conversationById = new Map(args.conversations.map((conv) => [conv.id, conv]));

  return (args.storedTabs?.tabs ?? [])
    .map((storedTab: StoredAgentTab) => {
      const conv = (storedTab.nakirosConversationId ? conversationById.get(storedTab.nakirosConversationId) : undefined)
        ?? (storedTab.conversationId ? conversationById.get(storedTab.conversationId) : undefined);
      const provider = isAgentProvider(storedTab.provider)
        ? storedTab.provider
        : (conv?.provider ?? args.preferredProvider);
      const repoPath = args.resolveRepoPath(storedTab.repoPath ?? conv?.repoPath);
      if (!repoPath) return null;
      return args.buildTab({
        id: storedTab.tabId,
        title: storedTab.title || conv?.title || args.defaultTabTitle,
        mode: storedTab.mode ?? conv?.mode ?? 'global',
        anchorRepoPath: storedTab.anchorRepoPath ?? conv?.anchorRepoPath ?? repoPath,
        activeRepoPaths: storedTab.activeRepoPaths ?? conv?.activeRepoPaths ?? [],
        lastResolvedRepoMentions: storedTab.lastResolvedRepoMentions ?? conv?.lastResolvedRepoMentions ?? [],
        repoPath,
        provider,
        participants: mergeParticipants(conv?.participants ?? [], storedTab.participants ?? []),
        activeParticipantId: storedTab.activeParticipantId ?? conv?.participants?.[0]?.participantId ?? null,
        artifactContext: storedTab.artifactContext ?? null,
        providerSessionId: storedTab.providerSessionId ?? storedTab.sessionId ?? undefined,
        sessionId: storedTab.sessionId ?? conv?.sessionId ?? null,
        conversationId: conv?.id ?? storedTab.conversationId ?? null,
        nakirosConversationId: storedTab.nakirosConversationId ?? null,
        messages: conv ? rawToUiMessages(conv.messages) : [],
      });
    })
    .filter(Boolean) as AgentTabState[];
}
