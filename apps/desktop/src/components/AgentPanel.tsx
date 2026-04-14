import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Bot,
  Send,
  Clock,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
import type {
  ArtifactChangeProposal,
  ArtifactContext,
  AgentProvider,
  AgentRunRequest,
  ConversationParticipant,
  NakirosActionBlock,
  OnboardingChatLaunchRequest,
  StoredAgentTabsState,
  StoredConversation,
  StoredRepo,
} from '@nakiros/shared';
import {
  AGENT_DEFINITIONS,
  buildAgentColorMap,
  buildAgentIdToTag,
  getAgentDefinitionLabel,
  resolveAgentDefinitions,
  type AgentDefinition,
} from '../constants/agents';
import {
  type ActionResult,
  type AgentTabState,
  type Message,
  type OrchestrationBlock,
  type OrchestrationParticipantBlock,
  buildVisibleConversationTranscript,
  extractActiveMentionContext,
  extractActiveProjectScopeContext,
  extractMeetingAgentTags,
  extractSlashFilter,
  extractWorkflowProgress,
  formatProviderName,
  humanizeAgentId,
  isAgentProvider,
  makeParticipantId,
  matchCommandDefinition,
  mergeParticipants,
  normalizeProjectScopeToken,
  rawToUiMessages,
  toWorkspaceSlug,
} from './agent/agent-panel-utils.js';
import {
  type OrchestrationParticipantResult,
  type OrchestrationExecution,
  buildActionResultSummary,
  collectAdditionalDirs,
  createAgentErrorMessage,
} from './agent/agent-panel-runtime.js';
import {
  appendRunStartError,
  startTrackedRun,
} from './agent/agent-panel-launch.js';
import {
  buildConversationHandoffPrompt,
  buildParticipantConsultationPrompt,
  buildSourceSynthesisPrompt,
} from './agent/agent-panel-prompts.js';
import { AgentInputMenus } from './agent/agent-panel-input-menus.js';
import { handleAgentInputKeydown } from './agent/agent-panel-input-keydown.js';
import { AgentMessagesPane, WorkflowProgressBar, type StreamingActivityLabel } from './agent/agent-panel-messages.js';
import {
  applyPreparedDispatchToTab,
  buildConversationUpsertForDispatch,
  buildStandardRunRequest,
  createJoinSeparatorMessage,
  prepareMessageDispatch,
  resolveSessionForRun,
} from './agent/agent-panel-send.js';
import {
  buildRecoveredConversations,
  buildTab as buildAgentPanelTab,
  createConversationFromTab as createStoredConversationFromTab,
  createParticipant as createAgentParticipant,
  restoreTabsFromStorage,
  serializeAgentTabsState,
} from './agent/agent-panel-state.js';
import { useAgentRunEvents } from './agent/use-agent-run-events.js';
import { usePreferences } from '../hooks/usePreferences';

interface SlashCommandOption {
  id: string;
  command: string;
  label: string;
  kind: 'agent' | 'workflow';
}

interface AgentMentionOption {
  tag: string;
  token: string;
  label: string;
  inConversation: boolean;
}

interface ProjectScopeOption {
  id: string;
  token: string;
  repoPath: string;
  label: string;
  isWorkspace: boolean;
}

const MAX_TABS = 12;
const TAB_SAVE_DEBOUNCE_MS = 320;
const DEFAULT_DESKTOP_NOTIFICATION_MIN_DURATION_SECONDS = 60;

interface Props {
  workspaceId: string;
  workspaceName?: string;
  repos: StoredRepo[];
  workspacePath?: string;
  initialRepoPath?: string;
  initialMessage?: string;
  initialAgentId?: string;
  persistentHistory?: boolean;
  onDone?: () => void;
  isVisible?: boolean;
  onRunCompletionNoticeChange?: (workspaceId: string, pendingCount: number) => void;
  openChatTarget?: OpenAgentRunChatPayload | null;
  launchChatRequest?: OnboardingChatLaunchRequest | null;
  onSpecUpdate?: (markdown: string) => void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  onFileChangesDetected?: (session: import('@nakiros/shared').FileChangesReviewSession) => void;
  onNakirosAction?: (action: string) => void;
  onActiveConversationChange?: (nakirosConversationId: string | null) => void;
  previewConversationId?: string | null;
  compactMode?: boolean;
  hideTabs?: boolean;
}

function providerLabel(provider: AgentProvider): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'cursor') return 'Cursor';
  return 'Claude';
}

function pickNextRandomIndex(length: number, currentIndex: number): number {
  if (length <= 1) return 0;
  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }
  return nextIndex;
}

export default function AgentPanel({
  workspaceId,
  workspaceName,
  repos,
  workspacePath,
  initialRepoPath,
  initialMessage,
  initialAgentId,
  persistentHistory,
  onDone,
  isVisible = true,
  onRunCompletionNoticeChange,
  openChatTarget,
  launchChatRequest,
  onSpecUpdate,
  onArtifactChangeProposal,
  onFileChangesDetected,
  onNakirosAction,
  onActiveConversationChange,
  previewConversationId,
  compactMode = false,
  hideTabs = false,
}: Props) {
  const { t } = useTranslation('agent');
  const { preferences } = usePreferences();
  function resolveAgentRunStartError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'workspace_launch_denied:viewer') {
      return t('workspaceLaunchDeniedViewer');
    }

    if (message === 'workspace_launch_denied:not-added') {
      return t('workspaceLaunchDeniedNotAdded');
    }

    return message || t('unableToStartRun');
  }

  const defaultTabTitle = t('newConversation');
  const desktopNotificationsEnabled = preferences.desktopNotificationsEnabled !== false;
  const desktopNotificationMinDurationSeconds = Math.min(
    3600,
    Math.max(
      0,
      Math.round(preferences.desktopNotificationMinDurationSeconds ?? DEFAULT_DESKTOP_NOTIFICATION_MIN_DURATION_SECONDS),
    ),
  );
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>(AGENT_DEFINITIONS);
  const agentIdToTag = useMemo(() => buildAgentIdToTag(agentDefinitions), [agentDefinitions]);
  const knownTags = useMemo(() => Object.values(agentIdToTag), [agentIdToTag]);
  const colorMap = useMemo(() => buildAgentColorMap(agentDefinitions), [agentDefinitions]);
  const tagToIdLower = useMemo(
    () => Object.fromEntries(Object.entries(agentIdToTag).map(([id, tag]) => [tag.toLowerCase(), id])),
    [agentIdToTag],
  );
  const commandLabelMap = useMemo(
    () => Object.fromEntries(
      agentDefinitions.map((definition) => [
        definition.command,
        getAgentDefinitionLabel(definition, t),
      ]),
    ),
    [agentDefinitions, t],
  );
  const slashCommands = useMemo<SlashCommandOption[]>(
    () => agentDefinitions.map((definition) => ({
      id: definition.id,
      command: definition.command,
      label: getAgentDefinitionLabel(definition, t),
      kind: definition.kind,
    })),
    [agentDefinitions, t],
  );
  const [tabs, setTabs] = useState<AgentTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<AgentProvider>('claude');
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [tabLimitMessage, setTabLimitMessage] = useState<string | null>(null);
  const [highlightedSlashIndex, setHighlightedSlashIndex] = useState(0);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [highlightedProjectScopeIndex, setHighlightedProjectScopeIndex] = useState(0);
  const [expandedToolPanels, setExpandedToolPanels] = useState<Record<string, boolean>>({});
  const [thinkingStateIndex, setThinkingStateIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeSlashItemRef = useRef<HTMLButtonElement>(null);
  const activeMentionItemRef = useRef<HTMLButtonElement>(null);
  const activeProjectScopeItemRef = useRef<HTMLButtonElement>(null);
  const tabCounterRef = useRef(0);
  const runToTabIdRef = useRef(new Map<string, string>());
  const runToParticipantIdRef = useRef(new Map<string, string>());
  const cancelledRunIdsRef = useRef(new Set<string>());
  const tabsRef = useRef<AgentTabState[]>([]);
  const conversationsRef = useRef<StoredConversation[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const lastHandledOpenChatEventIdRef = useRef<string | null>(null);
  const lastHandledLaunchRequestIdRef = useRef<string | null>(null);
  const initialMessageSentRef = useRef(false);
  const runStartedAtRef = useRef(new Map<string, number>());
  const sessionStartTimesRef = useRef(new Map<string, number>());
  const tabRawLinesRef = useRef(new Map<string, unknown[]>());
  const orchestrationExecutionsRef = useRef(new Map<string, OrchestrationExecution>());
  const runToOrchestrationExecutionRef = useRef(new Map<string, { executionId: string; role: 'participant' | 'synthesis' }>());
  const workspaceSlug = useMemo(() => toWorkspaceSlug(workspaceName || workspaceId), [workspaceId, workspaceName]);

  const repoPathSet = useMemo(() => new Set(repos.map((repo) => repo.localPath)), [repos]);
  const projectScopeOptions = useMemo<ProjectScopeOption[]>(() => {
    const options: ProjectScopeOption[] = [];
    const usedTokens = new Set<string>();
    const reserveToken = (base: string): string => {
      const normalized = normalizeProjectScopeToken(base) || 'repo';
      if (!usedTokens.has(normalized)) {
        usedTokens.add(normalized);
        return normalized;
      }
      let suffix = 2;
      while (usedTokens.has(`${normalized}-${suffix}`)) suffix += 1;
      const token = `${normalized}-${suffix}`;
      usedTokens.add(token);
      return token;
    };

    for (const repo of repos) {
      const folderName = repo.localPath.split('/').pop() ?? '';
      const token = reserveToken(repo.name || folderName || 'repo');
      options.push({
        id: `${repo.localPath}::${token}`,
        token,
        repoPath: repo.localPath,
        label: repo.name || folderName || repo.localPath,
        isWorkspace: false,
      });
    }

    return options;
  }, [repos, t]);
  const projectScopeTokenToRepoPath = useMemo(
    () => new Map(projectScopeOptions.map((option) => [option.token, option.repoPath])),
    [projectScopeOptions],
  );
  const projectScopeTokenByRepoPath = useMemo(() => {
    const next = new Map<string, string>();
    for (const option of projectScopeOptions) {
      if (!next.has(option.repoPath)) next.set(option.repoPath, option.token);
    }
    return next;
  }, [projectScopeOptions]);

  const workspaceConversations = useMemo(
    () => conversations.filter((conv) => {
      if (!conv.workspaceId) return false;
      return conv.workspaceId === workspaceId;
    }),
    [conversations, workspaceId],
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const activeNakirosConversationId = activeTab?.nakirosConversationId ?? null;
  useEffect(() => {
    onActiveConversationChange?.(activeNakirosConversationId);
  }, [activeNakirosConversationId, onActiveConversationChange]);

  const activeSlashFilter = useMemo(
    () => extractSlashFilter(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const filteredSlashCommands = useMemo(
    () => activeSlashFilter
      ? slashCommands.filter((item) => item.command.toLowerCase().startsWith(activeSlashFilter))
      : [],
    [activeSlashFilter, slashCommands],
  );
  const showSlashCommands = Boolean(activeTab && !activeTab.activeRunId && activeSlashFilter);
  const thinkingStateLabels = useMemo(
    () => [
      t('thinkingStates.analyzingContext'),
      t('thinkingStates.readingWorkspace'),
      t('thinkingStates.exploringFiles'),
      t('thinkingStates.verifyingScope'),
      t('thinkingStates.searchingKeyAreas'),
      t('thinkingStates.structuringResponse'),
      t('thinkingStates.preparingNextSteps'),
      t('thinkingStates.crossCheckingContext'),
      t('thinkingStates.consolidatingFindings'),
    ],
    [t],
  );
  const activeStreamingLabel = useMemo<StreamingActivityLabel>(() => ({
    primary: t('thinkingPrimary'),
    detail: thinkingStateLabels[thinkingStateIndex] ?? thinkingStateLabels[0] ?? t('thinking'),
  }), [t, thinkingStateIndex, thinkingStateLabels]);

  const hasReachedTabLimit = tabs.length >= MAX_TABS;
  const completionNoticeCount = useMemo(
    () => tabs.reduce((count, tab) => (tab.hasRunCompletionNotice ? count + 1 : count), 0),
    [tabs],
  );

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!activeTab?.activeRunId) return undefined;
    setThinkingStateIndex((current) => pickNextRandomIndex(thinkingStateLabels.length, current));
    const timer = window.setInterval(() => {
      setThinkingStateIndex((current) => pickNextRandomIndex(thinkingStateLabels.length, current));
    }, 2600);
    return () => window.clearInterval(timer);
  }, [activeTab?.activeRunId, thinkingStateLabels.length]);

  useEffect(() => {
    onRunCompletionNoticeChange?.(workspaceId, completionNoticeCount);
  }, [workspaceId, completionNoticeCount, onRunCompletionNoticeChange]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!tabsLoaded || !openChatTarget) return;
    if (openChatTarget.workspaceId !== workspaceId) return;

    const eventId = openChatTarget.eventId
      ?? `fallback-${openChatTarget.workspaceId}-${openChatTarget.tabId ?? ''}-${openChatTarget.conversationId ?? ''}`;
    if (lastHandledOpenChatEventIdRef.current === eventId) return;
    lastHandledOpenChatEventIdRef.current = eventId;

    const targetTab = openChatTarget.tabId
      ? tabsRef.current.find((tab) => tab.id === openChatTarget.tabId)
      : null;
    if (targetTab) {
      selectTab(targetTab.id);
      return;
    }

    const targetConversationId = openChatTarget.conversationId ?? null;
    if (targetConversationId) {
      const tabWithConversation = tabsRef.current.find((tab) => tab.conversationId === targetConversationId);
      if (tabWithConversation) {
        selectTab(tabWithConversation.id);
        return;
      }
      const conversation = conversationsRef.current.find((item) => item.id === targetConversationId);
      if (conversation) {
        void openConversationFromHistory(conversation);
        return;
      }
    }

    const fallbackTab = tabsRef.current.find((tab) => tab.hasRunCompletionNotice) ?? tabsRef.current[0];
    if (fallbackTab) selectTab(fallbackTab.id);
  }, [openChatTarget, tabsLoaded, workspaceId]);

  useEffect(() => {
    if (!tabsLoaded || !launchChatRequest) return;
    if (lastHandledLaunchRequestIdRef.current === launchChatRequest.requestId) return;
    lastHandledLaunchRequestIdRef.current = launchChatRequest.requestId;

    const tabId = createNewTab({
      focus: true,
      title: launchChatRequest.title,
      artifactContext: launchChatRequest.artifactContext ?? null,
    });
    if (!tabId) return;

    const messageToSend = launchChatRequest.initialMessage ?? launchChatRequest.command;
    updateTabInput(tabId, `${launchChatRequest.command} `);
    void sendMessageToTab(tabId, messageToSend);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchChatRequest, tabsLoaded]);

  useEffect(() => {
    let cancelled = false;
    void window.nakiros.getInstalledCommands()
      .then((commands) => {
        if (cancelled) return;
        setAgentDefinitions(resolveAgentDefinitions(commands));
      })
      .catch(() => {
        if (cancelled) return;
        setAgentDefinitions(AGENT_DEFINITIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    const runIds = Array.from(new Set(
      tabsRef.current
        .map((tab) => tab.activeRunId)
        .filter((runId): runId is string => Boolean(runId)),
    ));
    for (const runId of runIds) {
      runToTabIdRef.current.delete(runId);
      runToOrchestrationExecutionRef.current.delete(runId);
      runStartedAtRef.current.delete(runId);
      void window.nakiros.agentCancel(runId);
    }
    runStartedAtRef.current.clear();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.messages]);

  useEffect(() => {
    if (!isVisible) return;
    if (!activeTab?.hasRunCompletionNotice) return;
    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
      if (!atBottom) return;
      setTabsAndRef((prev) => prev.map((tab) => (
        tab.id === activeTab.id && tab.hasRunCompletionNotice
          ? { ...tab, hasRunCompletionNotice: false }
          : tab
      )));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isVisible, activeTab?.id, activeTab?.hasRunCompletionNotice, activeTab?.messages.length]);

  useEffect(() => {
    setHighlightedSlashIndex(0);
  }, [activeSlashFilter, activeTabId]);

  useEffect(() => {
    if (filteredSlashCommands.length === 0) return;
    setHighlightedSlashIndex((prev) => Math.min(prev, filteredSlashCommands.length - 1));
  }, [filteredSlashCommands.length]);

  useEffect(() => {
    if (!showSlashCommands || filteredSlashCommands.length === 0) return;
    window.requestAnimationFrame(() => {
      activeSlashItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showSlashCommands, filteredSlashCommands.length, highlightedSlashIndex]);

  function setTabsAndRef(updater: (prev: AgentTabState[]) => AgentTabState[]) {
    setTabs((prev) => {
      const next = updater(prev);
      tabsRef.current = next;
      return next;
    });
  }

  function selectTab(nextTabId: string | null) {
    activeTabIdRef.current = nextTabId;
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.id === nextTabId
        ? {
          ...tab,
          hasUnread: false,
          hasRunCompletionNotice: isVisible ? false : tab.hasRunCompletionNotice,
        }
        : tab
    )));
    setActiveTabId(nextTabId);
  }

  function getRepoName(repoPath: string): string {
    return repos.find((repo) => repo.localPath === repoPath)?.name ?? repoPath.split('/').pop() ?? '';
  }

  function getDefaultRepoPath(): string {
    const preferredPath = workspacePath?.trim();
    if (preferredPath && repoPathSet.has(preferredPath)) return preferredPath;
    if (initialRepoPath && repoPathSet.has(initialRepoPath)) return initialRepoPath;
    return repos[0]?.localPath ?? '';
  }

  function resolveRepoPath(candidate: string | null | undefined): string {
    if (candidate && repoPathSet.has(candidate)) return candidate;
    return getDefaultRepoPath();
  }

  function makeTabId(): string {
    tabCounterRef.current += 1;
    return `tab-${Date.now()}-${tabCounterRef.current}`;
  }

  function buildTab(args: Parameters<typeof buildAgentPanelTab>[0]): AgentTabState {
    return buildAgentPanelTab(args, {
      defaultTabTitle,
      getDefaultRepoPath,
      makeTabId,
      resolveRepoPath,
    });
  }

  function markTabUnread(tabId: string) {
    if (activeTabIdRef.current === tabId) return;
    setTabsAndRef((prev) => prev.map((tab) => (
      tab.id === tabId ? { ...tab, hasUnread: true } : tab
    )));
  }

  function createParticipant(
    args: Omit<Parameters<typeof createAgentParticipant>[0], 'makeParticipantId'>,
  ): ConversationParticipant {
    return createAgentParticipant({ ...args, makeParticipantId });
  }

  function upsertConversation(nextConversation: StoredConversation) {
    setConversations((prev) => {
      const filtered = prev.filter((conv) => conv.id !== nextConversation.id);
      const next = [nextConversation, ...filtered].sort(
        (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
      conversationsRef.current = next;
      return next;
    });
    void window.nakiros.saveConversation(nextConversation);
  }

  function createConversationFromTab(tab: AgentTabState, sessionId: string, explicitTitle?: string): StoredConversation {
    return createStoredConversationFromTab({
      tab,
      sessionId,
      workspaceId,
      workspaceSlug,
      workspaceName,
      defaultTabTitle,
      getRepoName,
      explicitTitle,
    });
  }

  function getAgentCommandDefinition(agentId: string): AgentDefinition | null {
    return agentDefinitions.find((definition) => definition.id === agentId && definition.kind === 'agent') ?? null;
  }

  function resolveRequestedProvider(requestedProvider: string | undefined, fallback: AgentProvider): AgentProvider {
    if (!requestedProvider || requestedProvider === 'current') return fallback;
    return isAgentProvider(requestedProvider) ? requestedProvider : fallback;
  }

  async function launchParticipantRun(args: {
    tabId: string;
    agentId: string;
    provider: AgentProvider;
    prompt: string;
    participantId?: string | null;
    orchestrationExecutionId?: string | null;
    orchestrationRole?: 'participant' | 'synthesis';
  }) {
    const currentTab = tabsRef.current.find((tab) => tab.id === args.tabId);
    if (!currentTab) return;

    const definition = getAgentCommandDefinition(args.agentId);
    if (!definition) return;

    const targetParticipantId = args.participantId ?? makeParticipantId(args.agentId, args.provider);
    const existingParticipant = currentTab.participants.find((participant) => participant.participantId === targetParticipantId) ?? null;
    const nextParticipants = mergeParticipants(currentTab.participants, [
      createParticipant({
        agentId: args.agentId,
        provider: args.provider,
        anchorRepoPath: currentTab.anchorRepoPath,
        activeRepoPaths: currentTab.activeRepoPaths,
        sessionId: existingParticipant?.sessionId ?? null,
        conversationId: existingParticipant?.conversationId ?? currentTab.conversationId ?? null,
        summary: existingParticipant?.summary ?? '',
        openQuestions: existingParticipant?.openQuestions ?? [],
        lastUsedAt: new Date().toISOString(),
        status: 'running',
      }),
    ]);
    const participantSessionId = nextParticipants.find((participant) => participant.participantId === targetParticipantId)?.sessionId ?? null;
    const commandPrefixedPrompt = participantSessionId
      ? args.prompt
      : `${definition.command}\n${args.prompt}`;

    const additionalDirs = collectAdditionalDirs(repos);

    setTabsAndRef((prev) => prev.map((tab) => (
      tab.id !== args.tabId
        ? tab
        : {
          ...tab,
          participants: nextParticipants,
          activeParticipantId: targetParticipantId,
        }
    )));

    const request: AgentRunRequest = {
      workspaceId,
      workspaceSlug,
      workspaceName: workspaceName ?? workspaceId,
      mode: currentTab.mode,
      anchorRepoPath: currentTab.anchorRepoPath,
      activeRepoPaths: currentTab.activeRepoPaths,
      lastResolvedRepoMentions: currentTab.lastResolvedRepoMentions,
      message: commandPrefixedPrompt,
      sessionId: participantSessionId,
      conversationId: currentTab.nakirosConversationId,
      agentId: args.agentId,
      participantId: targetParticipantId,
      additionalDirs,
      provider: args.provider,
    };

    await startTrackedRun({
      request,
      tabId: args.tabId,
      participantId: targetParticipantId,
      orchestrationExecutionId: args.orchestrationExecutionId,
      orchestrationRole: args.orchestrationRole,
      runAgent: (runRequest) => window.nakiros.agentRun(runRequest),
      tracking: {
        runToTabId: runToTabIdRef.current,
        runToParticipantId: runToParticipantIdRef.current,
        runStartedAt: runStartedAtRef.current,
        runToOrchestrationExecution: runToOrchestrationExecutionRef.current,
      },
      setTabsAndRef,
    });
  }

  async function continueOrchestrationExecution(executionId: string) {
    const execution = orchestrationExecutionsRef.current.get(executionId);
    if (!execution) return;

    const currentTab = tabsRef.current.find((tab) => tab.id === execution.tabId);
    if (!currentTab) return;

    // Parallel mode: launch all pending participants simultaneously
    if (execution.parallel && execution.pendingParticipants.length > 0) {
      const allParticipants = [...execution.pendingParticipants];
      execution.pendingParticipants.splice(0);
      execution.parallelPendingCount = allParticipants.length;
      orchestrationExecutionsRef.current.set(executionId, execution);
      await Promise.all(allParticipants.map(async (participant) => {
        const tab = tabsRef.current.find((t) => t.id === execution.tabId);
        if (!tab) return;
        const provider = resolveRequestedProvider(participant.provider, tab.provider);
        await launchParticipantRun({
          tabId: execution.tabId,
          agentId: participant.agent,
          provider,
          prompt: buildParticipantConsultationPrompt({
            sourceAgentId: execution.sourceAgentId,
            block: {
              mode: 'dispatch',
              roundState: 'continue',
              participants: [],
              scope: execution.sharedScope,
              repos: execution.sharedRepos,
              userGoal: execution.userGoal,
              synthesisGoal: execution.synthesisGoal,
            },
            participant,
            sourceVisibleContent: execution.sourceVisibleContent,
            completedParticipants: execution.completedParticipants,
            pendingParticipants: [],
            humanizeAgentId,
          }),
          orchestrationExecutionId: executionId,
          orchestrationRole: 'participant',
        });
      }));
      return;
    }

    if (currentTab.activeRunId) {
      window.setTimeout(() => {
        void continueOrchestrationExecution(executionId);
      }, 40);
      return;
    }

    const nextParticipant = execution.pendingParticipants.shift();
    if (nextParticipant) {
      orchestrationExecutionsRef.current.set(executionId, execution);
      const provider = resolveRequestedProvider(nextParticipant.provider, currentTab.provider);
      await launchParticipantRun({
        tabId: execution.tabId,
        agentId: nextParticipant.agent,
        provider,
        prompt: buildParticipantConsultationPrompt({
          sourceAgentId: execution.sourceAgentId,
          block: {
            mode: 'dispatch',
            roundState: 'continue',
            participants: [],
            scope: execution.sharedScope,
            repos: execution.sharedRepos,
            userGoal: execution.userGoal,
            synthesisGoal: execution.synthesisGoal,
          },
          participant: nextParticipant,
          sourceVisibleContent: execution.sourceVisibleContent,
          completedParticipants: execution.completedParticipants,
          pendingParticipants: execution.pendingParticipants,
          humanizeAgentId,
        }),
        orchestrationExecutionId: executionId,
        orchestrationRole: 'participant',
      });
      return;
    }

    orchestrationExecutionsRef.current.set(executionId, execution);
    if (!execution.sourceParticipantId) {
      orchestrationExecutionsRef.current.delete(executionId);
      return;
    }

    await launchParticipantRun({
      tabId: execution.tabId,
      agentId: execution.sourceAgentId,
      provider: execution.sourceProvider,
      participantId: execution.sourceParticipantId,
      prompt: buildSourceSynthesisPrompt({ execution, humanizeAgentId }),
      orchestrationExecutionId: executionId,
      orchestrationRole: 'synthesis',
    });
  }

  function maybeStartOrchestrationExecution(args: {
    tabId: string;
    sourceParticipantId: string | null;
    sourceProvider: AgentProvider;
    sourceAgentId: string;
    sourceVisibleContent: string;
    block: OrchestrationBlock;
  }) {
    if (args.block.participants.length === 0) return;

    const executionId = `orchestration-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    orchestrationExecutionsRef.current.set(executionId, {
      id: executionId,
      tabId: args.tabId,
      sourceParticipantId: args.sourceParticipantId,
      sourceProvider: args.sourceProvider,
      sourceAgentId: args.sourceAgentId,
      sourceVisibleContent: args.sourceVisibleContent,
      sharedScope: args.block.scope,
      sharedRepos: args.block.repos,
      userGoal: args.block.userGoal,
      synthesisGoal: args.block.synthesisGoal,
      pendingParticipants: [...args.block.participants],
      completedParticipants: [],
      parallel: args.block.parallel ?? false,
      parallelPendingCount: 0,
    });

    window.setTimeout(() => {
      void continueOrchestrationExecution(executionId);
    }, 0);
  }

  async function hydrateTabs() {
    const [storedConversations, prefs, storedTabs] = await Promise.all([
      window.nakiros.getConversations(workspaceId),
      window.nakiros.getPreferences(),
      window.nakiros.getAgentTabs(workspaceId),
    ]);

    const preferredProvider = prefs.agentProvider ?? 'claude';
    setDefaultProvider(preferredProvider);
    const {
      conversations: mergedConversations,
      recoveredConversations,
    } = buildRecoveredConversations({
      storedConversations,
      storedTabs,
      workspaceId,
      workspaceSlug,
      workspaceName,
      defaultTabTitle,
      preferredProvider,
      resolveRepoPath,
      getRepoName,
    });

    for (const recovered of recoveredConversations) {
      void window.nakiros.saveConversation(recovered);
    }

    conversationsRef.current = mergedConversations;
    setConversations(mergedConversations);

    const restoredTabs = restoreTabsFromStorage({
      storedTabs,
      conversations: mergedConversations,
      preferredProvider,
      defaultTabTitle,
      resolveRepoPath,
      buildTab,
    });

    const initialTabs = restoredTabs.length > 0
      ? restoredTabs
      : [buildTab({ repoPath: getDefaultRepoPath(), provider: preferredProvider })];

    const initialActiveTabId = (storedTabs?.activeTabId && initialTabs.some((tab) => tab.id === storedTabs.activeTabId))
      ? storedTabs.activeTabId
      : initialTabs[0]?.id ?? null;

    tabsRef.current = initialTabs;
    activeTabIdRef.current = initialActiveTabId;
    setTabs(initialTabs);
    setActiveTabId(initialActiveTabId);
    setTabsLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    runToTabIdRef.current.clear();
    runToParticipantIdRef.current.clear();
    cancelledRunIdsRef.current.clear();
    initialMessageSentRef.current = false;
    setShowHistory(false);
    setTabLimitMessage(null);
    setExpandedToolPanels({});
    setTabsLoaded(false);
    void (async () => {
      try {
        await hydrateTabs();
        if (cancelled) return;
      } catch {
        if (cancelled) return;
        const fallback = buildTab({ repoPath: getDefaultRepoPath(), provider: defaultProvider });
        tabsRef.current = [fallback];
        activeTabIdRef.current = fallback.id;
        setTabs([fallback]);
        setActiveTabId(fallback.id);
        setTabsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!tabsLoaded) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      const state: StoredAgentTabsState = serializeAgentTabsState({
        workspaceId,
        workspaceSlug,
        workspaceName,
        activeTabId,
        tabs,
      });
      void window.nakiros.saveAgentTabs(workspaceId, state);
    }, TAB_SAVE_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [workspaceId, workspaceSlug, workspaceName, tabs, activeTabId, tabsLoaded]);

  useAgentRunEvents({
    t,
    workspaceId,
    workspaceName,
    workspaceSlug,
    defaultTabTitle,
    isVisible,
    desktopNotificationsEnabled,
    desktopNotificationMinDurationSeconds,
    onDone,
    onSpecUpdate,
    onArtifactChangeProposal,
    onFileChangesDetected,
    activeTabIdRef,
    cancelledRunIdsRef,
    conversationsRef,
    orchestrationExecutionsRef,
    runStartedAtRef,
    runToOrchestrationExecutionRef,
    runToParticipantIdRef,
    runToTabIdRef,
    tabRawLinesRef,
    tabsRef,
    createConversationFromTab,
    createParticipant,
    getDefaultRepoPath,
    getRepoName,
    markTabUnread,
    maybeExecuteActions,
    maybeStartOrchestrationExecution,
    continueOrchestrationExecution,
    setTabsAndRef,
    upsertConversation,
  });

  async function maybeExecuteActions(_tabId: string, _messageId: string, _blocks: NakirosActionBlock[]) {
    // Agent action execution removed (SaaS feature)
  }

  function updateTabInput(tabId: string, value: string) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, input: value } : tab)));
  }

  function updateTabProvider(tabId: string, provider: AgentProvider) {
    setTabsAndRef((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, provider } : tab)));
  }

  function isToolPanelExpanded(msg: Message): boolean {
    const explicit = expandedToolPanels[msg.id];
    if (typeof explicit === 'boolean') return explicit;
    return msg.status === 'streaming';
  }

  function toggleToolPanel(messageId: string, currentExpanded: boolean) {
    setExpandedToolPanels((prev) => ({
      ...prev,
      [messageId]: !currentExpanded,
    }));
  }

  function applySlashCommand(tabId: string, command: string) {
    const nextInput = `${command} `;
    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }

  function applyAgentMention(tabId: string, tag: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    const mentionToken = `@${tag}`;
    const mention = extractActiveMentionContext(tab.input);
    const nextInput = mention
      ? `${tab.input.slice(0, mention.start)}${mentionToken} `
      : `${tab.input}${tab.input.length > 0 && !/\s$/.test(tab.input) ? ' ' : ''}${mentionToken} `;

    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }

  function applyProjectScope(tabId: string, token: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    const scopeToken = `#${token}`;
    const projectScope = extractActiveProjectScopeContext(tab.input);
    const nextInput = projectScope
      ? `${tab.input.slice(0, projectScope.start)}${scopeToken} `
      : `${tab.input}${tab.input.length > 0 && !/\s$/.test(tab.input) ? ' ' : ''}${scopeToken} `;

    updateTabInput(tabId, nextInput);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextInput.length, nextInput.length);
    });
  }


  function createNewTab(opts?: {
    focus?: boolean;
    repoPath?: string;
    provider?: AgentProvider;
    title?: string;
    artifactContext?: ArtifactContext | null;
  }): string | null {
    if (tabsRef.current.length >= MAX_TABS) {
      setTabLimitMessage(t('tabLimitReached', { count: MAX_TABS }));
      return null;
    }

    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    const tab = buildTab({
      anchorRepoPath: opts?.repoPath ?? active?.anchorRepoPath ?? getDefaultRepoPath(),
      activeRepoPaths: active?.activeRepoPaths ?? [],
      provider: opts?.provider ?? active?.provider ?? defaultProvider,
      title: opts?.title,
      artifactContext: opts?.artifactContext ?? null,
    });

    setTabsAndRef((prev) => [...prev, tab]);
    if (opts?.focus !== false) selectTab(tab.id);
    setTabLimitMessage(null);
    return tab.id;
  }

  function closeTab(tabId: string) {
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;

    sessionStartTimesRef.current.delete(tabId);
    tabRawLinesRef.current.delete(tabId);
    for (const [executionId, execution] of orchestrationExecutionsRef.current.entries()) {
      if (execution.tabId === tabId) orchestrationExecutionsRef.current.delete(executionId);
    }

    if (tab.activeRunId) {
      const runId = tab.activeRunId;
      cancelledRunIdsRef.current.add(runId);
      runToTabIdRef.current.delete(runId);
      runToOrchestrationExecutionRef.current.delete(runId);
      runStartedAtRef.current.delete(runId);
      void window.nakiros.agentCancel(runId).finally(() => {
        cancelledRunIdsRef.current.delete(runId);
      });
    }

    setTabsAndRef((prev) => prev.filter((item) => item.id !== tabId));

    const remaining = tabsRef.current.filter((item) => item.id !== tabId);
    if (remaining.length === 0) {
      const next = buildTab({ repoPath: getDefaultRepoPath(), provider: defaultProvider });
      tabsRef.current = [next];
      setTabs([next]);
      selectTab(next.id);
      return;
    }

    if (activeTabIdRef.current === tabId) {
      const closedIndex = tabsRef.current.findIndex((item) => item.id === tabId);
      const fallback = remaining[Math.max(0, closedIndex - 1)] ?? remaining[0] ?? null;
      selectTab(fallback?.id ?? null);
    }
  }

  async function sendMessageToTab(tabId: string, rawText: string, opts?: { silent?: boolean }) {
    const text = rawText.trim();

    const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!currentTab || currentTab.activeRunId) return;

    const userMessageCount = currentTab.messages.filter((msg) => msg.role === 'user').length;
    if (!text) return;

    // Silent injection: feed context to agent without showing a user bubble.
    if (opts?.silent) {
      const additionalDirsSilent = collectAdditionalDirs(repos);
      const request: AgentRunRequest = {
        workspaceId,
        workspaceSlug,
        workspaceName: workspaceName ?? workspaceId,
        mode: currentTab.mode,
        anchorRepoPath: currentTab.anchorRepoPath,
        activeRepoPaths: currentTab.activeRepoPaths,
        lastResolvedRepoMentions: currentTab.lastResolvedRepoMentions,
        message: text,
        sessionId: currentTab.sessionId,
        conversationId: currentTab.nakirosConversationId,
        agentId: currentTab.activeParticipantId?.split(':')[0] ?? 'default',
        participantId: currentTab.activeParticipantId,
        additionalDirs: additionalDirsSilent,
        provider: currentTab.provider,
      };
      try {
        await startTrackedRun({
          request,
          tabId,
          participantId: currentTab.activeParticipantId,
          runAgent: (runRequest) => window.nakiros.agentRun(runRequest),
          tracking: {
            runToTabId: runToTabIdRef.current,
            runToParticipantId: runToParticipantIdRef.current,
            runStartedAt: runStartedAtRef.current,
          },
          setTabsAndRef,
        });
      } catch (err) {
        appendRunStartError({
          tabId,
          errorMessage: createAgentErrorMessage(
            resolveAgentRunStartError(err),
            currentTab.activeParticipantId?.split(':')[0] ?? null,
          ),
          setTabsAndRef,
        });
      }
      return;
    }

    const preparedDispatch = prepareMessageDispatch({
      currentTab,
      text,
      projectScopeTokenToRepoPath,
      resolveRepoPath,
      createParticipant,
      makeParticipantId,
      agentDefinitions,
      commandLabelMap,
      defaultTabTitle,
      tagToIdLower,
    });

    if (preparedDispatch.scopeResolution.scopeOnlyMessage) {
      setTabsAndRef((prev) => prev.map((tab) => (
        tab.id === tabId
          ? {
            ...tab,
            input: '',
            anchorRepoPath: preparedDispatch.nextAnchorRepoPath,
            activeRepoPaths: preparedDispatch.nextActiveRepoPaths,
            lastResolvedRepoMentions: preparedDispatch.scopeResolution.mentionedTokens,
            repoPath: preparedDispatch.nextAnchorRepoPath,
          }
          : tab
      )));
      return;
    }

    if (preparedDispatch.invalidProviderName) {
      setTabsAndRef((prev) => prev.map((tab) => (
        tab.id === tabId
          ? {
            ...tab,
            messages: [...tab.messages, {
              id: `agent-error-${Date.now()}`,
              role: 'agent' as const,
              agentId: preparedDispatch.targetParticipantId?.split(':')[0] ?? null,
              content: t('providerNotConfigured', { provider: preparedDispatch.invalidProviderName }),
              status: 'error' as const,
              tools: [],
            }],
          }
          : tab
      )));
      return;
    }
    if (userMessageCount === 0 && !sessionStartTimesRef.current.has(tabId)) {
      sessionStartTimesRef.current.set(tabId, Date.now());
    }
    const existingConversation = currentTab.conversationId
      ? (conversationsRef.current.find((conversation) => conversation.id === currentTab.conversationId) ?? null)
      : null;
    const conversationUpsert = buildConversationUpsertForDispatch({
      currentTab,
      existingConversation,
      workspaceId,
      workspaceSlug,
      workspaceName,
      preparedDispatch,
      getRepoName,
    });
    if (conversationUpsert) {
      upsertConversation(conversationUpsert);
    }

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return applyPreparedDispatchToTab({
        tab,
        preparedDispatch,
        createdConversationId: conversationUpsert?.id ?? null,
      });
    }));

    const nextTab = tabsRef.current.find((tab) => tab.id === tabId);
    if (!nextTab) return;

    const additionalDirs = collectAdditionalDirs(repos);
    const participantSessionId = preparedDispatch.targetParticipantId
      ? preparedDispatch.nextParticipants.find((participant) => participant.participantId === preparedDispatch.targetParticipantId)?.sessionId ?? null
      : null;
    const invitedDefinition = preparedDispatch.directInviteAgentId
      ? getAgentCommandDefinition(preparedDispatch.directInviteAgentId)
      : null;
    const invitedPrompt = preparedDispatch.directInviteAgentId && preparedDispatch.targetParticipantId
      ? buildConversationHandoffPrompt({
        targetAgentId: preparedDispatch.directInviteAgentId,
        activeParticipantIds: [
          ...currentTab.participants.map((participant) => participant.participantId),
          preparedDispatch.targetParticipantId,
        ],
        activeRepoPaths: preparedDispatch.nextActiveRepoPaths,
        userText: preparedDispatch.effectiveText,
        transcript: buildVisibleConversationTranscript(preparedDispatch.visibleMessagesForHandoff),
        participantSummaries: currentTab.participants
          .filter((p) => p.summary.trim().length > 0)
          .map((p) => ({ agentId: p.agentId, summary: p.summary })),
        humanizeAgentId,
        getRepoName,
      })
      : null;
    const sessionForRun = resolveSessionForRun({
      selectedDefinition: preparedDispatch.selectedDefinition,
      participantSessionId,
      directInviteAgentId: preparedDispatch.directInviteAgentId,
      effectiveText: preparedDispatch.effectiveText,
      nextTabSessionId: nextTab.sessionId,
    });

    try {
      const messageForRun = preparedDispatch.directInviteAgentId && invitedDefinition
        ? (participantSessionId
          ? invitedPrompt ?? preparedDispatch.effectiveText
          : `${invitedDefinition.command}\n${invitedPrompt ?? preparedDispatch.effectiveText}`)
        : preparedDispatch.effectiveText;
      const request: AgentRunRequest = buildStandardRunRequest({
        workspaceId,
        workspaceSlug,
        workspaceName,
        nextTab,
        nextAnchorRepoPath: preparedDispatch.nextAnchorRepoPath,
        nextActiveRepoPaths: preparedDispatch.nextActiveRepoPaths,
        mentionedTokens: preparedDispatch.scopeResolution.mentionedTokens,
        messageForRun,
        sessionForRun,
        targetParticipantId: preparedDispatch.targetParticipantId,
        additionalDirs,
        effectiveProvider: preparedDispatch.effectiveProvider,
        artifactContext: nextTab.artifactContext,
      });
      const separatorMessage = createJoinSeparatorMessage({
        directInviteAgentId: preparedDispatch.directInviteAgentId,
        invitedParticipantId: preparedDispatch.invitedParticipantId,
        currentParticipants: currentTab.participants,
        resolvedProviderOverride: preparedDispatch.resolvedProviderOverride,
        formatProviderName,
        humanizeAgentId,
        t,
      });
      await startTrackedRun({
        request,
        tabId,
        participantId: preparedDispatch.targetParticipantId,
        extraMessages: separatorMessage ? [separatorMessage] : [],
        runAgent: (runRequest) => window.nakiros.agentRun(runRequest),
        tracking: {
          runToTabId: runToTabIdRef.current,
          runToParticipantId: runToParticipantIdRef.current,
          runStartedAt: runStartedAtRef.current,
        },
        setTabsAndRef,
      });
    } catch (err) {
      appendRunStartError({
        tabId,
        errorMessage: createAgentErrorMessage(
          resolveAgentRunStartError(err),
          preparedDispatch.targetParticipantId?.split(':')[0] ?? null,
        ),
        setTabsAndRef,
      });
    }
  }

  function stopActiveRun() {
    if (!activeTab?.activeRunId) return;
    const runId = activeTab.activeRunId;
    cancelledRunIdsRef.current.add(runId);
    runStartedAtRef.current.delete(runId);
    void window.nakiros.agentCancel(runId);

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== activeTab.id) return tab;
      return {
        ...tab,
        activeRunId: null,
        runningCommand: null,
        messages: tab.messages.map((msg) => (
          msg.status === 'streaming'
            ? { ...msg, status: 'complete', content: `${msg.content}\n\n${t('stoppedMarker')}` }
            : msg
        )),
      };
    }));
  }

  function createNewConversationTab() {
    createNewTab({ focus: true });
  }

  async function openConversationFromHistory(conv: StoredConversation) {
    const existing = tabsRef.current.find((tab) => tab.conversationId === conv.id);
    if (existing) {
      selectTab(existing.id);
      setShowHistory(false);
      return;
    }

    const tabId = createNewTab({
      focus: true,
      repoPath: conv.anchorRepoPath ?? conv.repoPath,
      provider: conv.provider,
      title: conv.title,
    });

    if (!tabId) return;

    setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        title: conv.title,
        mode: conv.mode ?? 'global',
        anchorRepoPath: resolveRepoPath(conv.anchorRepoPath ?? conv.repoPath),
        activeRepoPaths: (conv.activeRepoPaths ?? []).map((path) => resolveRepoPath(path)),
        lastResolvedRepoMentions: conv.lastResolvedRepoMentions ?? [],
        repoPath: resolveRepoPath(conv.anchorRepoPath ?? conv.repoPath),
        provider: conv.provider,
        participants: conv.participants ?? [],
        activeParticipantId: conv.participants?.[0]?.participantId ?? null,
        sessionId: conv.participants?.[0]?.providerSessionId ?? conv.participants?.[0]?.sessionId ?? conv.sessionId,
        conversationId: conv.id,
        messages: rawToUiMessages(conv.messages),
      };
    }));

    setShowHistory(false);
  }

  function deleteConversation(id: string) {
    const tabIdsToClose = tabsRef.current
      .filter((tab) => tab.conversationId === id)
      .map((tab) => tab.id);

    void window.nakiros.deleteConversation(id, workspaceId);
    setConversations((prev) => {
      const next = prev.filter((conv) => conv.id !== id);
      conversationsRef.current = next;
      return next;
    });

    for (const tabId of tabIdsToClose) {
      closeTab(tabId);
    }
  }

  function formatRelativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('timeNow');
    if (minutes < 60) return t('timeMinutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('timeHoursAgo', { count: hours });
    return t('timeDaysAgo', { count: Math.floor(hours / 24) });
  }

  function groupConversations(convs: StoredConversation[]): Array<{ label: string; items: StoredConversation[] }> {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const groups: Record<string, StoredConversation[]> = {
      [t('historyToday')]: [],
      [t('historyYesterday')]: [],
      [t('historyThisWeek')]: [],
      [t('historyOlder')]: [],
    };
    for (const conv of convs) {
      const d = new Date(conv.lastUsedAt);
      if (d >= todayStart) groups[t('historyToday')]?.push(conv);
      else if (d >= yesterdayStart) groups[t('historyYesterday')]?.push(conv);
      else if (d >= weekStart) groups[t('historyThisWeek')]?.push(conv);
      else groups[t('historyOlder')]?.push(conv);
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }

  useEffect(() => {
    if (!tabsLoaded || !initialAgentId) return;
    const initialDefinition = agentDefinitions.find((definition) => definition.id === initialAgentId);
    if (!initialDefinition) return;

    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    if (!active || active.messages.length > 0 || active.input.trim()) return;
    updateTabInput(active.id, `${initialDefinition.command} `);
  }, [tabsLoaded, initialAgentId, agentDefinitions]);

  useEffect(() => {
    if (!tabsLoaded || !initialMessage || initialMessageSentRef.current) return;

    initialMessageSentRef.current = true;
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? null;

    let targetTabId = active?.id ?? null;
    if (!active || active.messages.length > 0 || active.activeRunId) {
      targetTabId = createNewTab({
        focus: true,
        repoPath: active?.anchorRepoPath ?? getDefaultRepoPath(),
        provider: active?.provider ?? defaultProvider,
      });
    }

    if (targetTabId) {
      void sendMessageToTab(targetTabId, initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLoaded, initialMessage]);

  const activeMessages = activeTab?.messages ?? [];
  const activeCommandDefinition = useMemo(() => {
    for (let index = activeMessages.length - 1; index >= 0; index -= 1) {
      const message = activeMessages[index];
      if (message?.role !== 'user') continue;
      return matchCommandDefinition(message.content, agentDefinitions);
    }
    return null;
  }, [activeMessages, agentDefinitions]);
  const meetingAgentTags = useMemo(
    () => extractMeetingAgentTags(
      activeMessages,
      activeCommandDefinition ? agentIdToTag[activeCommandDefinition.id] : undefined,
      knownTags,
    ),
    [activeMessages, activeCommandDefinition, agentIdToTag, knownTags],
  );
  const mentionOptions = useMemo<AgentMentionOption[]>(
    () => agentDefinitions
      .filter((definition) => definition.kind === 'agent')
      .map((definition) => {
      const tag = agentIdToTag[definition.id] ?? humanizeAgentId(definition.id);
      return {
        tag,
        token: `@${tag}`,
        label: getAgentDefinitionLabel(definition, t),
        inConversation: meetingAgentTags.includes(tag),
      };
    })
      .sort((a, b) => {
        if (a.inConversation !== b.inConversation) {
          return a.inConversation ? -1 : 1;
        }
        return a.label.localeCompare(b.label);
      }),
    [meetingAgentTags, agentDefinitions, t],
  );
  const activeMention = useMemo(
    () => extractActiveMentionContext(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const activeProjectScope = useMemo(
    () => extractActiveProjectScopeContext(activeTab?.input ?? ''),
    [activeTab?.input],
  );
  const filteredMentionOptions = useMemo(
    () => {
      if (!activeMention) return [];
      return mentionOptions.filter((option) => option.tag.toLowerCase().startsWith(activeMention.query));
    },
    [mentionOptions, activeMention],
  );
  const filteredProjectScopeOptions = useMemo(
    () => {
      if (!activeProjectScope) return [];
      return projectScopeOptions.filter((option) => option.token.startsWith(activeProjectScope.query));
    },
    [projectScopeOptions, activeProjectScope],
  );
  const showMentionMenu = Boolean(activeTab && !activeTab.activeRunId && activeMention);
  const showProjectScopeMenu = Boolean(activeTab && !activeTab.activeRunId && activeProjectScope);
  const historyCount = workspaceConversations.length;
  const isInputDisabled = !activeTab || !!activeTab.activeRunId;
  const canSend = Boolean(activeTab && !activeTab.activeRunId && activeTab.input.trim());
  const activeScopeTokens = useMemo(
    () => (activeTab?.activeRepoPaths ?? [])
      .map((repoPath) => {
        const token = projectScopeTokenByRepoPath.get(repoPath);
        if (!token) return null;
        return {
          token,
          repoPath,
        };
      })
      .filter((item): item is { token: string; repoPath: string } => item !== null),
    [activeTab?.activeRepoPaths, projectScopeTokenByRepoPath],
  );
  const emptyStateRepoExample = useMemo(
    () => `#${projectScopeOptions.find((option) => !option.isWorkspace)?.token ?? 'repo'}`,
    [projectScopeOptions],
  );

  useEffect(() => {
    setHighlightedMentionIndex(0);
  }, [activeMention?.start, activeMention?.query, activeTabId]);

  useEffect(() => {
    setHighlightedProjectScopeIndex(0);
  }, [activeProjectScope?.start, activeProjectScope?.query, activeTabId]);

  useEffect(() => {
    if (filteredMentionOptions.length === 0) return;
    setHighlightedMentionIndex((prev) => Math.min(prev, filteredMentionOptions.length - 1));
  }, [filteredMentionOptions.length]);

  useEffect(() => {
    if (filteredProjectScopeOptions.length === 0) return;
    setHighlightedProjectScopeIndex((prev) => Math.min(prev, filteredProjectScopeOptions.length - 1));
  }, [filteredProjectScopeOptions.length]);

  useEffect(() => {
    if (!showMentionMenu || filteredMentionOptions.length === 0) return;
    window.requestAnimationFrame(() => {
      activeMentionItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showMentionMenu, filteredMentionOptions.length, highlightedMentionIndex]);

  useEffect(() => {
    if (!showProjectScopeMenu || filteredProjectScopeOptions.length === 0) return;
    window.requestAnimationFrame(() => {
      activeProjectScopeItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showProjectScopeMenu, filteredProjectScopeOptions.length, highlightedProjectScopeIndex]);

  // Last assistant text message — used for compact mode summary
  const lastAssistantText = useMemo(() => {
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      const msg = activeMessages[i];
      if (msg && msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
        const text = msg.content.trim();
        return text.length > 200 ? `${text.slice(0, 200)}…` : text;
      }
    }
    return null;
  }, [activeMessages]);

  return (
    <div className={clsx('relative flex h-full w-full min-w-0 overflow-hidden bg-[var(--bg)]', persistentHistory && !compactMode ? 'flex-row' : 'flex-col')}>
      {persistentHistory && !compactMode && (
        <div className={LEFT_HISTORY_PANEL_CLASS}>
          <div className={HISTORY_PANEL_HEADER_CLASS}>
            <Clock size={12} color="var(--primary)" />
            <span className="flex-1 text-xs font-bold text-[var(--text)]">{t('history')}</span>
            <button
              onClick={createNewConversationTab}
              title={t('newConversation')}
              className={NEW_CONV_BUTTON_SMALL_CLASS}
              disabled={hasReachedTabLimit}
            >
              <Plus size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {workspaceConversations.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">
                {t('noConversation')}
              </div>
            ) : (
              groupConversations(workspaceConversations).map(({ label, items }) => (
                <div key={label}>
                  <div className={HISTORY_GROUP_LABEL_CLASS}>{label}</div>
                  {items.map((conv) => {
                    const isOpen = tabs.some((t) => t.conversationId === conv.id);
                    return (
                      <div
                        key={conv.id}
                        className={historyItemClass(isOpen)}
                        onClick={() => void openConversationFromHistory(conv)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void openConversationFromHistory(conv);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={clsx('truncate text-xs text-[var(--text)]', isOpen ? 'font-bold' : 'font-semibold')}>
                            {conv.title}
                          </div>
                          {conv.agents && conv.agents.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {conv.agents.map((agentId) => (
                                <span key={agentId} className="rounded-[6px] border border-[var(--line)] bg-[var(--bg-soft)] px-1 py-px text-[9px] text-[var(--text-muted)]">
                                  {agentIdToTag[agentId] ?? agentId}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {formatRelativeDate(conv.lastUsedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          className={HISTORY_DELETE_BUTTON_CLASS}
                          title={t('delete')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {!compactMode && <div className={HEADER_CLASS}>
        <Bot size={15} color="var(--primary)" />
        <span className="text-xs font-bold text-[var(--text)]">{t('agents')}</span>
        <span className={SESSION_BADGE_CLASS}>
          {workspaceName ?? workspaceId}
        </span>

        {activeTab?.runningCommand && (
          <span className={RUNNING_INDICATOR_CLASS}>
            ● {activeTab.runningCommand.length > 55 ? `${activeTab.runningCommand.slice(0, 55)}…` : activeTab.runningCommand}
          </span>
        )}

        {!activeTab?.runningCommand && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className={PROJECT_SCOPE_BADGE_CLASS}>
              {activeTab?.mode === 'repo' ? t('modeRepo') : t('modeGlobal')}
            </span>
            {activeScopeTokens.map(({ token, repoPath }) => (
              <span
                key={token}
                title={t('projectScopeTitle', { project: getRepoName(repoPath) })}
                className={PROJECT_SCOPE_BADGE_CLASS}
              >
                #{token}
              </span>
            ))}
            {activeTab?.sessionId && (
              <span title={t('sessionTitle', { id: activeTab.sessionId })} className={SESSION_BADGE_CLASS}>
                ↺ {providerLabel(activeTab.provider)} {t('session')}
              </span>
            )}
            {!persistentHistory && !hideTabs && (
              <button
                onClick={() => setShowHistory((value) => !value)}
                title={t('conversationHistory')}
                className={historyToggleButtonClass(showHistory)}
              >
                <Clock size={11} />
                {historyCount > 0 && (
                  <span className="rounded-[8px] bg-[var(--primary)] px-1 text-[10px] leading-[14px] text-white">
                    {historyCount}
                  </span>
                )}
              </button>
            )}
            {!hideTabs && (
              <button
                onClick={createNewConversationTab}
                title={t('newConversation')}
                className={NEW_CONV_BUTTON_CLASS}
                disabled={hasReachedTabLimit}
              >
                <Plus size={11} />
                {t('new')}
              </button>
            )}
          </div>
        )}
      </div>}

      {!hideTabs && (
        <div className={TAB_STRIP_CLASS}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isRunning = !!tab.activeRunId;
            const hasPreview = !!previewConversationId && tab.nakirosConversationId === previewConversationId;
            return (
              <div key={tab.id} className={tabItemClass(isActive)}>
                <button
                  onClick={() => selectTab(tab.id)}
                  className={TAB_SELECT_BUTTON_CLASS}
                  title={tab.title}
                >
                  <span className="truncate">
                    {tab.title}
                  </span>
                  <span className={SESSION_BADGE_COMPACT_CLASS}>
                    {providerLabel(tab.provider)}
                  </span>
                  {tab.hasRunCompletionNotice && <span className={TAB_COMPLETED_DOT_CLASS} />}
                  {!tab.hasRunCompletionNotice && tab.hasUnread && <span className={TAB_UNREAD_DOT_CLASS} />}
                  {!tab.hasRunCompletionNotice && !tab.hasUnread && isRunning && <span className={TAB_RUNNING_DOT_CLASS} />}
                  {!tab.hasRunCompletionNotice && !tab.hasUnread && !isRunning && hasPreview && <span className={TAB_PREVIEW_DOT_CLASS} />}
                </button>
                <button onClick={() => closeTab(tab.id)} className={TAB_CLOSE_BUTTON_CLASS} title={t('close')}>
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {previewConversationId && activeTab?.nakirosConversationId === previewConversationId && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--primary)]/20 bg-[var(--primary)]/8 px-3 py-1.5">
          <span className="text-[10px]">🔗</span>
          <span className="text-[11px] font-medium text-[var(--primary)]">
            Preview générée par cette conversation
          </span>
        </div>
      )}

      {tabLimitMessage && (
        <div className="border-b border-[var(--line)] bg-[#fffbeb] px-4 py-1.5 text-[11px] text-[#b45309]">
          {tabLimitMessage}
        </div>
      )}

      {!persistentHistory && showHistory && (
        <div className={HISTORY_OVERLAY_CLASS}>
          <div className={HISTORY_HEADER_CLASS}>
            <Clock size={12} color="var(--primary)" />
            <span className="text-xs font-bold text-[var(--text)]">{t('workspaceHistory')}</span>
            <button onClick={() => setShowHistory(false)} className={HISTORY_CLOSE_BUTTON_CLASS}>✕</button>
          </div>
          {workspaceConversations.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              {t('noSavedConversation')}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {workspaceConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={historyItemClass(false)}
                  onClick={() => void openConversationFromHistory(conv)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openConversationFromHistory(conv);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[var(--text)]">
                      {conv.title}
                    </div>
                    <div className="mt-0.5 flex gap-1.5 text-[10px] text-[var(--text-muted)]">
                      <span>{conv.repoName}</span>
                      <span>·</span>
                      <span>{providerLabel(conv.provider)}</span>
                      <span>·</span>
                      <span>{formatRelativeDate(conv.lastUsedAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className={HISTORY_DELETE_BUTTON_CLASS}
                    title={t('delete')}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(() => {
        const progress = extractWorkflowProgress(activeMessages);
        return progress ? (
          <WorkflowProgressBar
            current={progress.current}
            total={progress.total}
            label={progress.label}
          />
        ) : null;
      })()}

      <div
        ref={messagesContainerRef}
        className={MESSAGES_AREA_CLASS}
        onScroll={() => {
          if (!isVisible) return;
          if (!activeTab?.hasRunCompletionNotice) return;
          const container = messagesContainerRef.current;
          if (!container) return;
          const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
          if (!atBottom) return;
          setTabsAndRef((prev) => prev.map((tab) => (
            tab.id === activeTab.id && tab.hasRunCompletionNotice
              ? { ...tab, hasRunCompletionNotice: false }
              : tab
          )));
        }}
      >
        <AgentMessagesPane
          messages={activeMessages}
          emptyStateRepoExample={emptyStateRepoExample}
          activeStreamingLabel={activeStreamingLabel}
          isToolPanelExpanded={isToolPanelExpanded}
          toggleToolPanel={toggleToolPanel}
          t={t}
          colorMap={colorMap}
          knownTags={knownTags}
          onWorkflowChoiceClick={activeTab
            ? (choice) => { void sendMessageToTab(activeTab.id, choice); }
            : undefined}
          onNakirosAction={onNakirosAction}
        />

        <div ref={messagesEndRef} />
      </div>


      <div className={INPUT_BAR_CLASS}>
        <AgentInputMenus
          showSlashCommands={showSlashCommands}
          filteredSlashCommands={filteredSlashCommands}
          highlightedSlashIndex={highlightedSlashIndex}
          activeSlashItemRef={activeSlashItemRef}
          onSelectSlashCommand={(command) => activeTab && applySlashCommand(activeTab.id, command)}
          onHighlightSlashCommand={setHighlightedSlashIndex}
          showMentionMenu={showMentionMenu}
          mentionOptions={mentionOptions}
          filteredMentionOptions={filteredMentionOptions}
          highlightedMentionIndex={highlightedMentionIndex}
          activeMentionItemRef={activeMentionItemRef}
          onSelectMention={(tag) => activeTab && applyAgentMention(activeTab.id, tag)}
          onHighlightMention={setHighlightedMentionIndex}
          showProjectScopeMenu={showProjectScopeMenu}
          filteredProjectScopeOptions={filteredProjectScopeOptions}
          highlightedProjectScopeIndex={highlightedProjectScopeIndex}
          activeProjectScopeItemRef={activeProjectScopeItemRef}
          onSelectProjectScope={(token) => activeTab && applyProjectScope(activeTab.id, token)}
          onHighlightProjectScope={setHighlightedProjectScopeIndex}
          t={t}
        />
        <div className={INPUT_GRID_CLASS}>
          <div className="col-span-10 min-w-0">
            <textarea
              ref={inputRef}
              value={activeTab?.input ?? ''}
              onChange={(e) => activeTab && updateTabInput(activeTab.id, e.target.value)}
              onKeyDown={(e) => {
                handleAgentInputKeydown({
                  event: e,
                  hasActiveTab: Boolean(activeTab),
                  showSlashCommands,
                  slashMenu: {
                    isVisible: Boolean(activeTab && showSlashCommands),
                    items: filteredSlashCommands,
                    highlightedIndex: highlightedSlashIndex,
                    selectItem: (command) => activeTab && applySlashCommand(activeTab.id, command.command),
                    updateHighlightedIndex: setHighlightedSlashIndex,
                  },
                  showMentionMenu,
                  mentionMenu: {
                    isVisible: Boolean(activeTab && !showSlashCommands && showMentionMenu),
                    items: filteredMentionOptions,
                    highlightedIndex: highlightedMentionIndex,
                    selectItem: (mention) => activeTab && applyAgentMention(activeTab.id, mention.tag),
                    updateHighlightedIndex: setHighlightedMentionIndex,
                  },
                  showProjectScopeMenu,
                  projectScopeMenu: {
                    isVisible: Boolean(activeTab && !showSlashCommands && !showMentionMenu && showProjectScopeMenu),
                    items: filteredProjectScopeOptions,
                    highlightedIndex: highlightedProjectScopeIndex,
                    selectItem: (project) => activeTab && applyProjectScope(activeTab.id, project.token),
                    updateHighlightedIndex: setHighlightedProjectScopeIndex,
                  },
                  sendMessage: () => {
                    if (activeTab) {
                      void sendMessageToTab(activeTab.id, activeTab.input);
                    }
                  },
                });
              }}
              placeholder={t('inputPlaceholder')}
              disabled={isInputDisabled}
              rows={4}
              className={textareaClass(isInputDisabled)}
            />
          </div>
          <div className="col-span-2 min-w-0">
            <div className={COMBO_CONTROL_CLASS}>
              <select
                value={activeTab?.provider ?? 'claude'}
                onChange={(e) => activeTab && updateTabProvider(activeTab.id, e.target.value as AgentProvider)}
                className={COMBO_SELECT_CLASS}
                disabled={!activeTab || !!activeTab.activeRunId}
                title={t('provider')}
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="cursor">Cursor</option>
              </select>
              <span className={COMBO_SEPARATOR_CLASS} />
              {activeTab?.activeRunId ? (
                <button
                  onClick={stopActiveRun}
                  title={t('stop')}
                  className={comboActionButtonClass({ running: true, disabled: false })}
                >
                  <span className="h-3 w-3 rounded-[1px] bg-white" />
                </button>
              ) : (
                <button
                  onClick={() => activeTab && void sendMessageToTab(activeTab.id, activeTab.input)}
                  disabled={!canSend}
                  title={t('sendEnter')}
                  className={comboActionButtonClass({ running: false, disabled: !canSend })}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

const HEADER_CLASS =
  'flex shrink-0 items-center gap-2.5 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5';
const TAB_STRIP_CLASS =
  'flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5';
const TAB_SELECT_BUTTON_CLASS =
  'flex min-w-0 items-center border-none bg-transparent px-2 py-1 text-[11px] text-[var(--text)]';
const TAB_CLOSE_BUTTON_CLASS =
  'grid h-6 w-6 shrink-0 place-items-center border-0 border-l border-[var(--line)] bg-transparent text-[var(--text-muted)]';
const TAB_RUNNING_DOT_CLASS = 'ml-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--primary)]';
const TAB_COMPLETED_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[#14b8a6]';
const TAB_UNREAD_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]';
const TAB_PREVIEW_DOT_CLASS = 'ml-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]';
const MESSAGES_AREA_CLASS = 'flex flex-1 flex-col gap-3.5 overflow-y-auto p-4';
const INPUT_BAR_CLASS =
  'flex shrink-0 flex-col border-t border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5';
const INPUT_GRID_CLASS = 'grid grid-cols-12 items-end gap-2';
const COMBO_CONTROL_CLASS =
  'flex h-[34px] w-full items-center overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] focus-within:border-[var(--primary)]';
const COMBO_SELECT_CLASS =
  'h-full min-w-0 flex-1 cursor-pointer border-none bg-transparent px-2 text-[11px] text-[var(--text)] outline-none disabled:cursor-not-allowed disabled:opacity-60';
const COMBO_SEPARATOR_CLASS = 'h-4 w-px bg-[var(--line)]';
const RUNNING_INDICATOR_CLASS =
  'ml-auto max-w-[280px] truncate font-mono text-[10px] text-[var(--primary)]';
const SESSION_BADGE_CLASS =
  'cursor-default rounded-[10px] bg-[var(--primary-soft)] px-1.5 py-px font-mono text-[10px] text-[var(--primary)]';
const PROJECT_SCOPE_BADGE_CLASS =
  'cursor-default rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-1.5 py-px font-mono text-[10px] text-[var(--text)]';
const NEW_CONV_BUTTON_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--line)] bg-transparent px-2 py-[3px] text-[11px] text-[var(--text-muted)] disabled:opacity-50';
const NEW_CONV_BUTTON_SMALL_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--line)] bg-transparent px-1.5 py-[2px] text-[11px] text-[var(--text-muted)] disabled:opacity-50';
const SESSION_BADGE_COMPACT_CLASS =
  'ml-1.5 cursor-default rounded-[10px] bg-[var(--primary-soft)] px-1.5 py-px font-mono text-[9px] text-[var(--primary)]';
const HISTORY_OVERLAY_CLASS =
  'absolute inset-x-0 bottom-0 top-[73px] z-10 flex flex-col border-t border-[var(--line)] bg-[var(--bg)]';
const HISTORY_HEADER_CLASS =
  'flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5';
const HISTORY_CLOSE_BUTTON_CLASS =
  'ml-auto border-none bg-transparent px-1 py-0.5 text-sm leading-none text-[var(--text-muted)]';
const HISTORY_DELETE_BUTTON_CLASS =
  'grid shrink-0 place-items-center rounded-[10px] border-none bg-transparent p-1 text-[var(--text-muted)]';
const LEFT_HISTORY_PANEL_CLASS =
  'flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--bg-soft)]';
const HISTORY_PANEL_HEADER_CLASS =
  'flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-3 py-2.5';
const HISTORY_GROUP_LABEL_CLASS =
  'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]';
function tabItemClass(active: boolean): string {
  return clsx(
    'flex min-w-0 items-center rounded-[10px] border',
    active
      ? 'border-[var(--line-strong)] bg-[var(--bg-card)]'
      : 'border-[var(--line)] bg-[var(--bg-soft)]',
  );
}

function historyToggleButtonClass(showHistory: boolean): string {
  return clsx(NEW_CONV_BUTTON_CLASS, showHistory ? 'bg-[var(--bg-muted)]' : 'bg-transparent');
}

function historyItemClass(active: boolean): string {
  return clsx(
    'flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5 transition-colors',
    active ? 'bg-[var(--primary-soft)]' : 'bg-transparent',
  );
}

function textareaClass(disabled: boolean): string {
  return clsx(
    'ui-form-control block w-full resize-none rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-[7px] text-[13px] leading-[1.5] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none',
    disabled && 'opacity-50',
  );
}

function comboActionButtonClass({ running, disabled }: { running: boolean; disabled: boolean }): string {
  return clsx(
    'grid h-full w-9 shrink-0 place-items-center border-none transition-colors',
    running
      ? 'bg-[#ef4444] text-white'
      : (disabled
        ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-muted)]'
        : 'bg-[var(--primary)] text-white'),
  );
}
