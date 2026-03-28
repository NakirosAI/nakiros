import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import type {
  ArtifactChangeProposal,
  AgentProvider,
  ConversationParticipant,
  FileChangesReviewSession,
  StoredConversation,
} from '@nakiros/shared';
import { useIpcListener } from '../../hooks/useIpcListener.js';
import {
  type AgentTabState,
  extractActionBlocks,
  extractAgentSummaryBlock,
  extractOrchestrationBlocks,
  extractSpecUpdateBlocks,
  formatSummaryForStorage,
  mergeParticipants,
} from './agent-panel-utils.js';
import {
  type AgentPanelStreamEvent,
  type OrchestrationExecution,
} from './agent-panel-runtime.js';
import {
  artifactTargetLabel,
  resolveArtifactMode,
} from '../../utils/artifact-review.js';

interface AgentStartPayload {
  runId: string;
  command: string;
  cwd: string;
  conversationId?: string | null;
}

interface AgentEventPayload {
  runId: string;
  event: AgentPanelStreamEvent;
}

interface AgentDonePayload {
  runId: string;
  exitCode: number;
  error?: unknown;
  rawLines?: unknown[];
}

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

interface UseAgentRunEventsArgs {
  t: TFunction<'agent'>;
  workspaceId: string;
  workspaceName?: string;
  workspaceSlug: string;
  defaultTabTitle: string;
  isVisible: boolean;
  desktopNotificationsEnabled: boolean;
  desktopNotificationMinDurationSeconds: number;
  onDone?: () => void;
  onSpecUpdate?: (markdown: string) => void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  onFileChangesDetected?: (session: FileChangesReviewSession) => void;
  activeTabIdRef: MutableRefObject<string | null>;
  cancelledRunIdsRef: MutableRefObject<Set<string>>;
  conversationsRef: MutableRefObject<StoredConversation[]>;
  orchestrationExecutionsRef: MutableRefObject<Map<string, OrchestrationExecution>>;
  runStartedAtRef: MutableRefObject<Map<string, number>>;
  runToOrchestrationExecutionRef: MutableRefObject<Map<string, { executionId: string; role: 'participant' | 'synthesis' }>>;
  runToParticipantIdRef: MutableRefObject<Map<string, string>>;
  runToTabIdRef: MutableRefObject<Map<string, string>>;
  tabRawLinesRef: MutableRefObject<Map<string, unknown[]>>;
  tabsRef: MutableRefObject<AgentTabState[]>;
  createConversationFromTab: (tab: AgentTabState, sessionId: string, explicitTitle?: string) => StoredConversation;
  createParticipant: (args: CreateParticipantArgs) => ConversationParticipant;
  getDefaultRepoPath: () => string;
  getRepoName: (repoPath: string) => string;
  markTabUnread: (tabId: string) => void;
  maybeExecuteActions: (tabId: string, messageId: string, blocks: ReturnType<typeof extractActionBlocks>['blocks']) => Promise<void>;
  maybeStartOrchestrationExecution: (args: {
    tabId: string;
    sourceParticipantId: string | null;
    sourceProvider: AgentProvider;
    sourceAgentId: string;
    sourceVisibleContent: string;
    block: ReturnType<typeof extractOrchestrationBlocks>['blocks'][number];
  }) => void;
  continueOrchestrationExecution: (executionId: string) => Promise<void>;
  setTabsAndRef: (updater: (prev: AgentTabState[]) => AgentTabState[]) => void;
  upsertConversation: (nextConversation: StoredConversation) => void;
}

function resolveParticipantProvider(participantId: string | null, fallbackProvider: AgentProvider): AgentProvider {
  return (participantId?.split(':')[1] ?? fallbackProvider) as AgentProvider;
}

function resolveParticipantAgentId(participantId: string | null, fallbackAgentId = 'agent'): string {
  return participantId?.split(':')[0] ?? fallbackAgentId;
}

export function useAgentRunEvents(args: UseAgentRunEventsArgs): void {
  useIpcListener(window.nakiros.onAgentStart, ({ runId, command, cwd, conversationId }: AgentStartPayload) => {
    const tabId = args.runToTabIdRef.current.get(runId);
    if (!tabId) return;

    // Take a filesystem snapshot before the agent writes anything
    void window.nakiros.snapshotTake(args.workspaceSlug, runId).catch((err: unknown) => {
      console.warn('[snapshot] Failed to take snapshot:', err);
    });

    args.setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        runningCommand: command,
        nakirosConversationId: conversationId ?? tab.nakirosConversationId,
        messages: tab.messages.map((msg) => (
          msg.id === `agent-${runId}` ? { ...msg, content: `_cwd: \`${cwd}\`_\n\n` } : msg
        )),
      };
    }));
  });

  useIpcListener(window.nakiros.onAgentEvent, ({ runId, event }: AgentEventPayload) => {
    const tabId = args.runToTabIdRef.current.get(runId);
    if (!tabId) return;
    const participantId = args.runToParticipantIdRef.current.get(runId) ?? null;
    const currentTab = args.tabsRef.current.find((tab) => tab.id === tabId);
    const participantProvider = resolveParticipantProvider(participantId, currentTab?.provider ?? 'claude');

    if (event.type === 'session') {
      const nextParticipants = participantId
        ? mergeParticipants(currentTab?.participants ?? [], [
          args.createParticipant({
            agentId: resolveParticipantAgentId(participantId),
            provider: participantProvider,
            anchorRepoPath: currentTab?.anchorRepoPath ?? args.getDefaultRepoPath(),
            activeRepoPaths: currentTab?.activeRepoPaths ?? [],
            sessionId: event.id,
            conversationId: currentTab?.conversationId ?? null,
            summary: currentTab?.participants.find((participant) => participant.participantId === participantId)?.summary ?? '',
            openQuestions: currentTab?.participants.find((participant) => participant.participantId === participantId)?.openQuestions ?? [],
            lastUsedAt: new Date().toISOString(),
            status: 'idle',
          }),
        ])
        : (currentTab?.participants ?? []);

      if (currentTab?.conversationId) {
        const conversation = args.conversationsRef.current.find((item) => item.id === currentTab.conversationId);
        if (conversation) {
          args.upsertConversation({
            ...conversation,
            sessionId: event.id,
            participants: nextParticipants,
            lastUsedAt: new Date().toISOString(),
          });
        }
        args.setTabsAndRef((prev) => prev.map((tab) => (
          tab.id === tabId
            ? {
              ...tab,
              sessionId: event.id,
              participants: nextParticipants,
              activeParticipantId: participantId ?? tab.activeParticipantId,
            }
            : tab
        )));
      } else if (currentTab) {
        const conversation = args.createConversationFromTab(currentTab, event.id);
        args.upsertConversation({ ...conversation, participants: nextParticipants });
        args.setTabsAndRef((prev) => prev.map((tab) => (
          tab.id !== tabId ? tab : {
            ...tab,
            sessionId: event.id,
            conversationId: conversation.id,
            pendingTitle: null,
            title: conversation.title,
            participants: nextParticipants,
            activeParticipantId: participantId ?? tab.activeParticipantId,
          }
        )));
      }

      args.markTabUnread(tabId);
      return;
    }

    if (event.type === 'text') {
      args.setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((msg) => (
            msg.id === `agent-${runId}` ? { ...msg, content: msg.content + event.text } : msg
          )),
        };
      }));
      args.markTabUnread(tabId);
      return;
    }

    if (event.type === 'tool') {
      args.setTabsAndRef((prev) => prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((msg) => (
            msg.id === `agent-${runId}`
              ? { ...msg, tools: [...msg.tools, { name: event.name, display: event.display }] }
              : msg
          )),
        };
      }));
      args.markTabUnread(tabId);
    }
  });

  useIpcListener(window.nakiros.onAgentDone, ({ runId, exitCode, error, rawLines }: AgentDonePayload) => {
    const startedAt = args.runStartedAtRef.current.get(runId) ?? null;
    args.runStartedAtRef.current.delete(runId);
    const runDurationSeconds = startedAt
      ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      : 0;
    const tabId = args.runToTabIdRef.current.get(runId);
    args.runToTabIdRef.current.delete(runId);
    const participantId = args.runToParticipantIdRef.current.get(runId) ?? null;
    args.runToParticipantIdRef.current.delete(runId);
    const orchestrationRun = args.runToOrchestrationExecutionRef.current.get(runId) ?? null;
    args.runToOrchestrationExecutionRef.current.delete(runId);
    const wasCancelled = args.cancelledRunIdsRef.current.delete(runId);
    if (!tabId) return;

    if (rawLines && rawLines.length > 0) {
      const existing = args.tabRawLinesRef.current.get(tabId) ?? [];
      args.tabRawLinesRef.current.set(tabId, [...existing, ...rawLines]);
    }

    const currentTab = args.tabsRef.current.find((tab) => tab.id === tabId);
    const completedMessage = currentTab?.messages.find((message) => message.id === `agent-${runId}`) ?? null;
    const completedContent = error
      ? (error instanceof Error ? error.message : String(error))
      : (completedMessage?.content ?? '');
    const { visibleContent: completedVisibleContent, blocks: completedOrchestrationBlocks } =
      extractOrchestrationBlocks(completedContent);
    const { visibleContent: noSpecContent, specMarkdown: completedSpecMarkdown } =
      extractSpecUpdateBlocks(completedVisibleContent);
    const { blocks: completedActionBlocks } = extractActionBlocks(noSpecContent);
    const { visibleContent: completedFinalContent, summaryData: completedSummaryData } =
      extractAgentSummaryBlock(noSpecContent);
    if (completedSpecMarkdown && args.onSpecUpdate) args.onSpecUpdate(completedSpecMarkdown);

    // Detect filesystem changes made by the agent and surface them for review
    if (!wasCancelled && !error && exitCode === 0 && args.onFileChangesDetected) {
      void window.nakiros.snapshotDiff(args.workspaceSlug, runId).then((session) => {
        if (session && session.changes.length > 0) {
          args.onFileChangesDetected!(session);
        }
      }).catch((err: unknown) => {
        console.warn('[snapshot] Failed to diff snapshot:', err);
      });
    }

    const participantProvider = resolveParticipantProvider(participantId, currentTab?.provider ?? 'claude');
    const nextParticipantStatus: ConversationParticipant['status'] = wasCancelled
      ? 'idle'
      : (error || exitCode !== 0 ? 'error' : 'idle');
    const nextParticipants = participantId
      ? mergeParticipants(currentTab?.participants ?? [], [
        args.createParticipant({
          agentId: resolveParticipantAgentId(participantId),
          provider: participantProvider,
          anchorRepoPath: currentTab?.anchorRepoPath ?? args.getDefaultRepoPath(),
          activeRepoPaths: currentTab?.activeRepoPaths ?? [],
          sessionId: currentTab?.sessionId ?? null,
          conversationId: currentTab?.conversationId ?? null,
          summary: completedSummaryData
            ? formatSummaryForStorage(completedSummaryData)
            : (currentTab?.participants.find((participant) => participant.participantId === participantId)?.summary ?? ''),
          openQuestions: completedSummaryData?.openQuestions.length
            ? completedSummaryData.openQuestions
            : (currentTab?.participants.find((participant) => participant.participantId === participantId)?.openQuestions ?? []),
          lastUsedAt: new Date().toISOString(),
          status: nextParticipantStatus,
        }),
      ])
      : (currentTab?.participants ?? []);

    if (currentTab?.conversationId) {
      const conversation = args.conversationsRef.current.find((item) => item.id === currentTab.conversationId);
      if (conversation) {
        args.upsertConversation({
          ...conversation,
          workspaceSlug: args.workspaceSlug,
          workspaceName: args.workspaceName ?? args.workspaceId,
          mode: currentTab.mode,
          anchorRepoPath: currentTab.anchorRepoPath,
          activeRepoPaths: currentTab.activeRepoPaths,
          lastResolvedRepoMentions: currentTab.lastResolvedRepoMentions,
          repoPath: currentTab.anchorRepoPath,
          repoName: args.getRepoName(currentTab.anchorRepoPath),
          provider: currentTab.provider,
          workspaceId: args.workspaceId,
          sessionId: currentTab.sessionId ?? conversation.sessionId,
          participants: nextParticipants,
          lastUsedAt: new Date().toISOString(),
          messages: [...conversation.messages, ...(rawLines ?? [])],
        });
      }
    }

    const shouldNotifyCompletion = !wasCancelled && (
      !args.isVisible || args.activeTabIdRef.current !== tabId
    );
    const shouldSendDesktopNotification = args.desktopNotificationsEnabled
      && shouldNotifyCompletion
      && runDurationSeconds >= args.desktopNotificationMinDurationSeconds;

    if (shouldSendDesktopNotification) {
      void window.nakiros.showAgentRunNotification({
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
        conversationId: currentTab?.conversationId ?? null,
        tabId,
        conversationTitle: currentTab?.title ?? args.defaultTabTitle,
        provider: currentTab?.provider,
        durationSeconds: runDurationSeconds,
      });
    }

    args.setTabsAndRef((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;

      const nextMessages = tab.messages.map((msg) => {
        if (msg.id !== `agent-${runId}`) return msg;
        if (wasCancelled) return { ...msg, status: 'complete' as const };
        if (error) return { ...msg, content: completedContent, status: 'error' as const };
        if (exitCode !== 0) {
          if (msg.content.trim()) return { ...msg, status: 'error' as const };
          return {
            ...msg,
            content: args.t('processExitedWithCode', { code: String(exitCode) }),
            status: 'error' as const,
          };
        }
        return { ...msg, status: 'complete' as const };
      });

      return {
        ...tab,
        activeRunId: null,
        runningCommand: null,
        participants: nextParticipants,
        messages: nextMessages,
        hasRunCompletionNotice: tab.hasRunCompletionNotice || shouldNotifyCompletion,
      };
    }));

    args.markTabUnread(tabId);

    if (!wasCancelled && !error && exitCode === 0) {
      if (orchestrationRun?.role === 'participant') {
        const execution = args.orchestrationExecutionsRef.current.get(orchestrationRun.executionId);
        if (execution && participantId) {
          execution.completedParticipants.push({
            agent: resolveParticipantAgentId(participantId),
            provider: participantProvider,
            content: completedFinalContent || completedContent,
            summary: completedSummaryData ? formatSummaryForStorage(completedSummaryData) : '',
          });
          if (execution.parallel) {
            execution.parallelPendingCount = Math.max(0, execution.parallelPendingCount - 1);
          }
          args.orchestrationExecutionsRef.current.set(orchestrationRun.executionId, execution);
          const shouldProceed = !execution.parallel || execution.parallelPendingCount === 0;
          if (shouldProceed) {
            window.setTimeout(() => {
              void args.continueOrchestrationExecution(orchestrationRun.executionId);
            }, 0);
          }
        }
        if (!wasCancelled) args.onDone?.();
        return;
      }

      if (orchestrationRun?.role === 'synthesis') {
        args.orchestrationExecutionsRef.current.delete(orchestrationRun.executionId);
      }

      const sourceAgentId = resolveParticipantAgentId(participantId, currentTab?.activeParticipantId?.split(':')[0] ?? 'nakiros');
      const executionBlock = completedOrchestrationBlocks.find((block) => block.participants.length > 0);
      if (executionBlock) {
        args.maybeStartOrchestrationExecution({
          tabId,
          sourceParticipantId: participantId,
          sourceProvider: participantProvider,
          sourceAgentId,
          sourceVisibleContent: completedVisibleContent,
          block: executionBlock,
        });
      }

      if (completedActionBlocks.length > 0) {
        void args.maybeExecuteActions(tabId, `agent-${runId}`, completedActionBlocks);
      }
    }

    if (!wasCancelled) args.onDone?.();
  });
}
