import type {
  ArtifactContext,
  AgentProvider,
  AgentRunRequest,
  ConversationParticipant,
  StoredConversation,
} from '@nakiros/shared';
import type { AgentDefinition } from '../../constants/agents.js';
import {
  type AgentTabState,
  type Message,
  type ProjectScopeResolution,
  generateTitle,
  matchCommandDefinition,
  mergeParticipants,
  parseAtMentions,
  resolveProjectScopeInMessage,
  resolveProviderOverride,
  startsWithNakirosSlashCommand,
} from './agent-panel-utils.js';
import { buildArtifactContextRunMessage } from '../../utils/artifact-review.js';

interface CreateParticipantArgs {
  agentId: string;
  provider: AgentProvider;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  sessionId?: string | null;
  conversationId?: string | null;
  summary?: string;
  openQuestions?: string[];
  lastUsedAt?: string;
  status?: ConversationParticipant['status'];
}

export interface PreparedMessageDispatch {
  effectiveText: string;
  scopeResolution: ProjectScopeResolution;
  nextActiveRepoPaths: string[];
  nextAnchorRepoPath: string;
  resolvedProviderOverride: AgentProvider | 'invalid' | null;
  invalidProviderName: string | null;
  effectiveProvider: AgentProvider;
  selectedDefinition: AgentDefinition | null;
  directInviteAgentId: string | null;
  invitedParticipantId: string | null;
  targetParticipantId: string | null;
  nextParticipants: ConversationParticipant[];
  title: string;
  shouldSetPendingTitle: boolean;
  userMessage: Message;
  userRaw: { type: 'user'; content: string; timestamp: string };
  visibleMessagesForHandoff: Message[];
}

export interface PrepareMessageDispatchArgs {
  currentTab: AgentTabState;
  text: string;
  projectScopeTokenToRepoPath: Map<string, string>;
  resolveRepoPath: (candidate: string | null | undefined) => string;
  createParticipant: (args: CreateParticipantArgs) => ConversationParticipant;
  makeParticipantId: (agentId: string, provider: AgentProvider) => string;
  agentDefinitions: AgentDefinition[];
  commandLabelMap: Record<string, string>;
  defaultTabTitle: string;
  /** tag.toLowerCase() → agentId — dérivé des définitions résolues pour supporter les agents dynamiques */
  tagToIdLower?: Record<string, string>;
}

export interface BuildPendingConversationArgs {
  currentTab: AgentTabState;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  nextAnchorRepoPath: string;
  nextActiveRepoPaths: string[];
  nextParticipants: ConversationParticipant[];
  provider: AgentProvider;
  title: string;
  selectedDefinition: AgentDefinition | null;
  directInviteAgentId: string | null;
  mentionedTokens: string[];
  getRepoName: (repoPath: string) => string;
  userRaw: { type: 'user'; content: string; timestamp: string };
}

export interface BuildConversationUpsertForDispatchArgs {
  currentTab: AgentTabState;
  existingConversation: StoredConversation | null;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  preparedDispatch: PreparedMessageDispatch;
  getRepoName: (repoPath: string) => string;
}

export interface BuildStandardRunRequestArgs {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName?: string;
  nextTab: AgentTabState;
  nextAnchorRepoPath: string;
  nextActiveRepoPaths: string[];
  mentionedTokens: string[];
  messageForRun: string;
  sessionForRun: string | null;
  targetParticipantId: string | null;
  additionalDirs: string[];
  effectiveProvider: AgentProvider;
  artifactContext?: ArtifactContext | null;
}

export function prepareMessageDispatch(args: PrepareMessageDispatchArgs): PreparedMessageDispatch {
  const scopeResolution = resolveProjectScopeInMessage(args.text, args.projectScopeTokenToRepoPath);
  const nextActiveRepoPaths = scopeResolution.mentionedRepoPaths.length > 0
    ? scopeResolution.mentionedRepoPaths.map((path) => args.resolveRepoPath(path))
    : args.currentTab.activeRepoPaths;
  const nextAnchorRepoPath = args.resolveRepoPath(
    scopeResolution.mentionedRepoPaths[0]
    ?? args.currentTab.anchorRepoPath
    ?? args.currentTab.repoPath,
  );

  const effectiveText = args.text;
  const currentActiveAgentId = args.currentTab.activeParticipantId?.split(':')[0] ?? null;
  const atMentions = parseAtMentions(effectiveText, args.tagToIdLower);
  const explicitlyMentionedAgentId = atMentions[0]?.agentId ?? null;
  const firstMentionRawProvider = atMentions[0]?.rawProvider ?? null;
  const resolvedProviderOverride = resolveProviderOverride(firstMentionRawProvider);
  const effectiveProvider: AgentProvider = (resolvedProviderOverride !== null && resolvedProviderOverride !== 'invalid')
    ? resolvedProviderOverride
    : args.currentTab.provider;
  const selectedDefinition = matchCommandDefinition(effectiveText, args.agentDefinitions);
  const directInviteAgentId = !selectedDefinition
    && explicitlyMentionedAgentId
    && (
      !currentActiveAgentId
      || currentActiveAgentId === 'nakiros'
      || explicitlyMentionedAgentId !== currentActiveAgentId
    )
      ? explicitlyMentionedAgentId
      : null;
  const selectedAgentParticipantId = selectedDefinition?.kind === 'agent'
    ? args.makeParticipantId(selectedDefinition.id, args.currentTab.provider)
    : null;
  const invitedParticipantId = directInviteAgentId
    ? args.makeParticipantId(directInviteAgentId, effectiveProvider)
    : null;
  const fallbackParticipantId = selectedDefinition ? null : (invitedParticipantId ?? args.currentTab.activeParticipantId);
  const targetParticipantId = selectedAgentParticipantId ?? fallbackParticipantId;
  const existingParticipant = targetParticipantId
    ? args.currentTab.participants.find((participant) => participant.participantId === targetParticipantId) ?? null
    : null;
  const nextParticipants = targetParticipantId
    ? mergeParticipants(args.currentTab.participants, [
      args.createParticipant({
        agentId: existingParticipant?.agentId ?? selectedDefinition?.id ?? targetParticipantId.split(':')[0] ?? 'agent',
        provider: effectiveProvider,
        anchorRepoPath: nextAnchorRepoPath,
        activeRepoPaths: nextActiveRepoPaths,
        sessionId: existingParticipant?.sessionId ?? null,
        conversationId: existingParticipant?.conversationId ?? args.currentTab.conversationId ?? null,
        summary: existingParticipant?.summary ?? '',
        openQuestions: existingParticipant?.openQuestions ?? [],
        lastUsedAt: new Date().toISOString(),
        status: 'running',
      }),
    ])
    : args.currentTab.participants;
  const title = generateTitle(effectiveText, args.commandLabelMap, args.defaultTabTitle);
  const shouldSetPendingTitle = !args.currentTab.conversationId
    && args.currentTab.messages.filter((msg) => msg.role === 'user').length === 0;

  const userMessage: Message = {
    id: `user-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    role: 'user',
    content: args.text,
    status: 'complete',
    tools: [],
  };

  return {
    effectiveText,
    scopeResolution,
    nextActiveRepoPaths,
    nextAnchorRepoPath,
    resolvedProviderOverride,
    invalidProviderName: resolvedProviderOverride === 'invalid' ? firstMentionRawProvider : null,
    effectiveProvider,
    selectedDefinition,
    directInviteAgentId,
    invitedParticipantId,
    targetParticipantId,
    nextParticipants,
    title,
    shouldSetPendingTitle,
    userMessage,
    userRaw: { type: 'user', content: args.text, timestamp: new Date().toISOString() },
    visibleMessagesForHandoff: [...args.currentTab.messages, userMessage],
  };
}

export function buildPendingConversation(args: BuildPendingConversationArgs): StoredConversation {
  const now = new Date().toISOString();
  return {
    id: `conv-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    sessionId: args.currentTab.sessionId ?? `pending-${Date.now()}`,
    workspaceId: args.workspaceId,
    workspaceSlug: args.workspaceSlug,
    workspaceName: args.workspaceName ?? args.workspaceId,
    mode: args.currentTab.mode,
    anchorRepoPath: args.nextAnchorRepoPath,
    activeRepoPaths: args.nextActiveRepoPaths,
    lastResolvedRepoMentions: args.mentionedTokens,
    repoPath: args.nextAnchorRepoPath,
    repoName: args.getRepoName(args.nextAnchorRepoPath),
    provider: args.provider,
    participants: args.nextParticipants,
    title: args.title,
    agents: args.selectedDefinition
      ? [args.selectedDefinition.id]
      : (args.directInviteAgentId ? [args.directInviteAgentId] : []),
    createdAt: now,
    lastUsedAt: now,
    messages: [args.userRaw],
  };
}

export function resolveConversationAgents(
  existingAgents: string[],
  selectedDefinition: AgentDefinition | null,
  directInviteAgentId: string | null,
): string[] {
  if (directInviteAgentId && !existingAgents.includes(directInviteAgentId)) {
    return [
      ...(existingAgents.length > 0
        ? existingAgents
        : [selectedDefinition?.id].filter((value): value is string => Boolean(value))),
      directInviteAgentId,
    ];
  }

  if (existingAgents.length > 0) {
    return existingAgents;
  }

  return [selectedDefinition?.id ?? directInviteAgentId].filter((value): value is string => Boolean(value));
}

export function buildConversationUpsertForDispatch(
  args: BuildConversationUpsertForDispatchArgs,
): StoredConversation | null {
  if (args.preparedDispatch.shouldSetPendingTitle) {
    return buildPendingConversation({
      currentTab: args.currentTab,
      workspaceId: args.workspaceId,
      workspaceSlug: args.workspaceSlug,
      workspaceName: args.workspaceName,
      nextAnchorRepoPath: args.preparedDispatch.nextAnchorRepoPath,
      nextActiveRepoPaths: args.preparedDispatch.nextActiveRepoPaths,
      nextParticipants: args.preparedDispatch.nextParticipants,
      provider: args.currentTab.provider,
      title: args.preparedDispatch.title,
      selectedDefinition: args.preparedDispatch.selectedDefinition,
      directInviteAgentId: args.preparedDispatch.directInviteAgentId,
      mentionedTokens: args.preparedDispatch.scopeResolution.mentionedTokens,
      getRepoName: args.getRepoName,
      userRaw: args.preparedDispatch.userRaw,
    });
  }

  if (!args.existingConversation) {
    return null;
  }

  return {
    ...args.existingConversation,
    workspaceSlug: args.workspaceSlug,
    workspaceName: args.workspaceName ?? args.workspaceId,
    mode: args.currentTab.mode,
    anchorRepoPath: args.preparedDispatch.nextAnchorRepoPath,
    activeRepoPaths: args.preparedDispatch.nextActiveRepoPaths,
    lastResolvedRepoMentions: args.preparedDispatch.scopeResolution.mentionedTokens,
    repoPath: args.preparedDispatch.nextAnchorRepoPath,
    repoName: args.getRepoName(args.preparedDispatch.nextAnchorRepoPath),
    agents: resolveConversationAgents(
      args.existingConversation.agents,
      args.preparedDispatch.selectedDefinition,
      args.preparedDispatch.directInviteAgentId,
    ),
    participants: mergeParticipants(
      args.existingConversation.participants ?? [],
      args.preparedDispatch.nextParticipants,
    ),
    messages: [...args.existingConversation.messages, args.preparedDispatch.userRaw],
    lastUsedAt: new Date().toISOString(),
  };
}

export function applyPreparedDispatchToTab(args: {
  tab: AgentTabState;
  preparedDispatch: PreparedMessageDispatch;
  createdConversationId?: string | null;
}): AgentTabState {
  return {
    ...args.tab,
    input: '',
    title: args.preparedDispatch.shouldSetPendingTitle ? args.preparedDispatch.title : args.tab.title,
    pendingTitle: args.preparedDispatch.shouldSetPendingTitle ? null : args.tab.pendingTitle,
    conversationId: args.tab.conversationId ?? args.createdConversationId ?? null,
    anchorRepoPath: args.preparedDispatch.nextAnchorRepoPath,
    activeRepoPaths: args.preparedDispatch.nextActiveRepoPaths,
    lastResolvedRepoMentions: args.preparedDispatch.scopeResolution.mentionedTokens,
    repoPath: args.preparedDispatch.nextAnchorRepoPath,
    participants: args.preparedDispatch.nextParticipants,
    activeParticipantId: args.preparedDispatch.targetParticipantId,
    hasUnread: false,
    hasRunCompletionNotice: false,
    messages: [...args.tab.messages, args.preparedDispatch.userMessage],
  };
}

export function resolveSessionForRun(args: {
  selectedDefinition: AgentDefinition | null;
  participantSessionId: string | null;
  directInviteAgentId: string | null;
  effectiveText: string;
  nextTabSessionId: string | null;
}): string | null {
  if (args.selectedDefinition?.kind === 'workflow') return null;
  return args.participantSessionId
    ?? (args.directInviteAgentId ? null : (startsWithNakirosSlashCommand(args.effectiveText) ? null : args.nextTabSessionId));
}

export function buildStandardRunRequest(args: BuildStandardRunRequestArgs): AgentRunRequest {
  return {
    workspaceId: args.workspaceId,
    workspaceSlug: args.workspaceSlug,
    workspaceName: args.workspaceName ?? args.workspaceId,
    mode: args.nextTab.mode,
    anchorRepoPath: args.nextAnchorRepoPath,
    activeRepoPaths: args.nextActiveRepoPaths,
    lastResolvedRepoMentions: args.mentionedTokens,
    message: buildArtifactContextRunMessage(args.artifactContext, args.messageForRun),
    sessionId: args.sessionForRun,
    conversationId: args.nextTab.nakirosConversationId,
    agentId: args.targetParticipantId ? args.targetParticipantId.split(':')[0] : 'default',
    participantId: args.targetParticipantId,
    additionalDirs: args.additionalDirs,
    provider: args.effectiveProvider,
  };
}

export function createJoinSeparatorMessage(args: {
  directInviteAgentId: string | null;
  invitedParticipantId: string | null;
  currentParticipants: ConversationParticipant[];
  resolvedProviderOverride: AgentProvider | 'invalid' | null;
  formatProviderName: (provider: AgentProvider) => string;
  humanizeAgentId: (agentId: string) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): Message | null {
  const isFirstJoin = args.directInviteAgentId !== null
    && !args.currentParticipants.some((participant) => participant.participantId === args.invitedParticipantId);
  if (!isFirstJoin || !args.directInviteAgentId) return null;

  return {
    id: `sep-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    role: 'separator',
    separatorLabel: args.resolvedProviderOverride !== null && args.resolvedProviderOverride !== 'invalid'
      ? args.t('agentJoinedWithProvider', {
        name: args.humanizeAgentId(args.directInviteAgentId),
        provider: args.formatProviderName(args.resolvedProviderOverride),
      })
      : args.t('agentJoined', { name: args.humanizeAgentId(args.directInviteAgentId) }),
    content: '',
    status: 'complete',
    tools: [],
  };
}
