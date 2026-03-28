import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  ArtifactChangeProposal,
  AuthState,
  LocalTicket,
  OnboardingChatLaunchRequest,
  StoredWorkspace,
} from '@nakiros/shared';
import { Eye, Settings2 } from 'lucide-react';
import appIcon from '../assets/icon.svg';
import DashboardErrorBoundary from '../components/dashboard/DashboardErrorBoundary';
import { DashboardRouter } from '../components/dashboard/DashboardRouter';
import ArtifactReviewDock from '../components/review/ArtifactReviewDock';
import FileChangesReviewDock from '../components/review/FileChangesReviewDock';
import FeedbackModal from '../components/FeedbackModal';
import Sidebar, { type SidebarTab } from '../components/Sidebar';
import StatusBar from '../components/StatusBar';
import { Button } from '../components/ui';
import { useArtifactReview } from '../hooks/useArtifactReview';
import { useFileChangeReview } from '../hooks/useFileChangeReview';
import { usePreferences } from '../hooks/usePreferences';
import { useTickets } from '../hooks/useTickets';
import { useWorkspace } from '../hooks/useWorkspace';
import type { GlobalSettingsSection } from '../components/GlobalSettings';

export interface WorkspaceSyncState {
  syncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
}

interface Props {
  onUpdateWorkspace(workspace: StoredWorkspace): Promise<void>;
  onNewWorkspace(): void;
  onGoHome(): void;
  onGoGettingStarted(workspaceId: string): void;
  authState: AuthState;
  serverStatus: 'starting' | 'running' | 'stopped';
  workspaceSyncState: WorkspaceSyncState;
  updateBanner: UpdateCheckResult | null;
  onDismissUpdateBanner(): void;
  openAgentRunChatTarget?: OpenAgentRunChatPayload | null;
  launchChatRequest?: OnboardingChatLaunchRequest | null;
}

export default function Dashboard({
  onUpdateWorkspace,
  onNewWorkspace,
  onGoHome,
  onGoGettingStarted,
  authState,
  serverStatus,
  workspaceSyncState,
  updateBanner,
  onDismissUpdateBanner,
  openAgentRunChatTarget,
  launchChatRequest,
}: Props) {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const { t: tContext } = useTranslation('context');
  const { t: tSidebar } = useTranslation('sidebar');
  const { t: tToast } = useTranslation('toast');
  const { t: tSettings } = useTranslation('settings');
  const { t: tFeedback } = useTranslation('feedback');
  const { preferences } = usePreferences();
  const {
    workspace,
    openWorkspaces,
    activeWorkspaceId,
    allWorkspaces,
    openWorkspaceTab,
    closeWorkspaceTab,
  } = useWorkspace();

  const defaultProvider = preferences.agentProvider ?? 'claude';
  const {
    tickets,
    epics,
    refresh: refreshTickets,
    upsertTicketLocal,
    addTicketLocal,
  } = useTickets(workspace.id);

  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection>('general');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<LocalTicket | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuSide, setWorkspaceMenuSide] = useState<'left' | 'right'>('right');
  const [overviewDocsCount, setOverviewDocsCount] = useState(0);
  const [overviewConversationCount, setOverviewConversationCount] = useState(0);
  const [lastConversationAt, setLastConversationAt] = useState<string | null>(null);
  const [openPrdAssistantSignal, setOpenPrdAssistantSignal] = useState(0);
  const [chatCompletionNotices, setChatCompletionNotices] = useState<Record<string, number>>({});
  const [chatPendingPreviews, setChatPendingPreviews] = useState<Record<string, boolean>>({});
  const [contextLaunchRequest, setContextLaunchRequest] = useState<OnboardingChatLaunchRequest | null>(null);
  const [reviewOpenChatTarget, setReviewOpenChatTarget] = useState<OpenAgentRunChatPayload | null>(null);
  // Session-only banner dismissal (not persisted)
  const [setupBannerDismissed, setSetupBannerDismissed] = useState(false);
  const [onboardingIncomplete, setOnboardingIncomplete] = useState(false);
  const lastHandledAgentRunChatEventIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const {
    activeSession: activeArtifactReviewSession,
    isDockOpen: isArtifactReviewDockOpen,
    canReopenDock: canReopenArtifactReviewDock,
    isMutating: isArtifactReviewMutating,
    lastMutation: lastArtifactReviewMutation,
    openProposal: openArtifactReviewProposal,
    closeDock: closeArtifactReviewDock,
    reopenDock: reopenArtifactReviewDock,
    acceptActive: acceptActiveArtifactReview,
    rejectActive: rejectActiveArtifactReview,
  } = useArtifactReview({ onToast: pushToast });

  const {
    activeSession: activeFileChangesSession,
    isDockOpen: isFileChangesDockOpen,
    canReopenDock: canReopenFileChangesDock,
    isMutating: isFileChangesMutating,
    openSession: openFileChangesSession,
    closeDock: closeFileChangesDock,
    reopenDock: reopenFileChangesDock,
    acceptAll: acceptAllFileChanges,
    rejectAll: rejectAllFileChanges,
    acceptFile: acceptFileChange,
    rejectFile: rejectFileChange,
  } = useFileChangeReview({ onToast: pushToast });

  useEffect(() => {
    setSelectedTicket(null);
  }, [workspace.id]);

  useEffect(() => {
    if (!openAgentRunChatTarget) return;
    const eventId = openAgentRunChatTarget.eventId
      ?? `fallback-${openAgentRunChatTarget.workspaceId}-${openAgentRunChatTarget.tabId ?? ''}-${openAgentRunChatTarget.conversationId ?? ''}`;
    if (lastHandledAgentRunChatEventIdRef.current === eventId) return;
    if (openAgentRunChatTarget.workspaceId !== workspace.id) return;
    lastHandledAgentRunChatEventIdRef.current = eventId;
    setActiveTab('chat');
  }, [openAgentRunChatTarget, workspace.id]);

  useEffect(() => {
    if (!launchChatRequest) return;
    setActiveTab('chat');
  }, [launchChatRequest]);

  useEffect(() => {
    if (!contextLaunchRequest) return;
    setActiveTab('chat');
  }, [contextLaunchRequest]);

  useEffect(() => {
    if (!reviewOpenChatTarget) return;
    setActiveTab('chat');
  }, [reviewOpenChatTarget]);

  useEffect(() => {
    void refreshOverviewData();
    setOverviewDocsCount(0);
    // Check onboarding completion to decide whether to show the setup banner
    setSetupBannerDismissed(false); // reset dismissal on workspace switch
    void window.nakiros.getWorkspaceGettingStartedContext(workspace).then((ctx) => {
      const allDone = ctx.step1Complete && ctx.step2Complete && ctx.state.step3.completedAt !== null;
      setOnboardingIncomplete(!allDone);
    }).catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  useEffect(() => {
    setChatCompletionNotices((prev) => {
      const openIds = new Set(openWorkspaces.map((item) => item.id));
      const nextEntries = Object.entries(prev).filter(([workspaceId]) => openIds.has(workspaceId));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
  }, [openWorkspaces]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (workspaceMenuRef.current?.contains(target)) return;
      setIsWorkspaceMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsWorkspaceMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  async function refreshOverviewData() {
    const conversations = await window.nakiros.getConversations(workspace.id);
    const repoPaths = new Set(workspace.repos.map((repo) => repo.localPath));
    const workspaceConversations = conversations.filter((conversation) => {
      if (conversation.workspaceId) return conversation.workspaceId === workspace.id;
      return repoPaths.has(conversation.repoPath);
    });
    setOverviewConversationCount(workspaceConversations.length);
    setLastConversationAt(workspaceConversations[0]?.lastUsedAt ?? null);
  }

  function handleTicketUpdate(updated: LocalTicket) {
    upsertTicketLocal(updated);
    if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
  }

  function handleTicketCreate(ticket: LocalTicket) {
    addTicketLocal(ticket);
  }

  async function handleContextCopy() {
    if (!selectedTicket) return;
    setCopyingId(selectedTicket.id);
    try {
      const context = await window.nakiros.generateContext(workspace.id, selectedTicket.id, workspace);
      await window.nakiros.writeClipboard(context);
      pushToast(tToast('contextCopied', { ticketId: selectedTicket.id }));
    } catch {
      pushToast(tToast('contextCopyError'));
    } finally {
      setTimeout(() => setCopyingId(null), 1500);
    }
  }

  function pushToast(message: string) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  function handleArtifactChangeProposal(
    sourceSurface: 'chat' | 'product' | 'backlog',
    event: {
      proposal: ArtifactChangeProposal;
      conversationId?: string | null;
      triggerMessageId?: string | null;
      baselineContentOverride?: string | null;
      alreadyApplied?: boolean;
    },
  ) {
    void openArtifactReviewProposal({
      proposal: event.proposal,
      sourceSurface,
      conversationId: event.conversationId,
      triggerMessageId: event.triggerMessageId,
      baselineContentOverride: event.baselineContentOverride,
      alreadyApplied: event.alreadyApplied,
    });
  }

  function handleAskForArtifactChanges() {
    if (!activeArtifactReviewSession) return;
    if (activeArtifactReviewSession.conversationId) {
      setReviewOpenChatTarget({
        workspaceId: workspace.id,
        conversationId: activeArtifactReviewSession.conversationId,
        eventId: `artifact-review-${Date.now()}`,
      });
      return;
    }

      setContextLaunchRequest({
        requestId: `artifact-review-${workspace.id}-${Date.now()}`,
        title: `Revise · ${activeArtifactReviewSession.title}`,
        agentId: 'cto',
        command: '/nak-agent-cto',
        initialMessage: `Please revise the proposed change for "${activeArtifactReviewSession.title}".`,
        artifactContext: {
          target: activeArtifactReviewSession.target,
        mode: activeArtifactReviewSession.mode,
        sourceSurface: activeArtifactReviewSession.sourceSurface,
        title: activeArtifactReviewSession.title,
      },
    });
  }

  function handleChatPendingPreviewChange(workspaceId: string, hasPendingPreview: boolean) {
    setChatPendingPreviews((prev) => {
      if (prev[workspaceId] === hasPendingPreview) return prev;
      return { ...prev, [workspaceId]: hasPendingPreview };
    });
  }

  function handleChatRunCompletionNoticeChange(workspaceId: string, pendingCount: number) {
    setChatCompletionNotices((prev) => {
      const current = prev[workspaceId] ?? 0;
      if (pendingCount <= 0) {
        if (!(workspaceId in prev)) return prev;
        const { [workspaceId]: _removed, ...rest } = prev;
        return rest;
      }
      if (current === pendingCount) return prev;
      return { ...prev, [workspaceId]: pendingCount };
    });
  }

  const repoNames = workspace.repos.map((repo) => repo.name);
  const workspaceTopology = workspace.topology ?? (workspace.repos.length > 1 ? 'multi' : 'mono');
  const activeWorkspaceHasChatCompletion = (chatCompletionNotices[workspace.id] ?? 0) > 0;
  const activeWorkspaceHasPendingPreview = chatPendingPreviews[workspace.id] ?? false;
  const unopenedWorkspaces = allWorkspaces.filter(
    (candidate) => !openWorkspaces.some((openedWorkspace) => openedWorkspace.id === candidate.id),
  );
  const workspaceMenuPositionClass = workspaceMenuSide === 'right' ? 'left-0' : 'right-0';

  function toggleWorkspaceMenu() {
    const rect = workspaceMenuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const buttonCenter = rect.left + rect.width / 2;
      setWorkspaceMenuSide(buttonCenter <= window.innerWidth / 2 ? 'right' : 'left');
    }
    setIsWorkspaceMenuOpen((prev) => !prev);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {updateBanner && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[#0f766e] bg-[#0f766e] px-[18px] py-2 text-[13px] text-white">
          <span className="flex-1 font-semibold">
            {tCommon('updateBanner', { version: updateBanner.latestVersion })}
          </span>
          <button
            onClick={() => {
              setGlobalSettingsSection('agent-nakiros');
              setShowGlobalSettings(true);
            }}
            className="rounded-[10px] border border-white/25 bg-white/12 px-3 py-1 text-[12px] font-bold text-white"
          >
            {tSettings('updateNow')}
          </button>
          <button
            onClick={onDismissUpdateBanner}
            className="border-0 bg-transparent px-1 text-[18px] leading-none text-white/90"
            aria-label={tSettings('closeSettings')}
          >
            ×
          </button>
        </div>
      )}

      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-[18px]">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            onClick={onGoHome}
            title={t('home')}
            aria-label={t('home')}
            className="grid h-7 w-7 place-items-center rounded-lg border-none bg-transparent p-0"
          >
            <img src={appIcon} alt="Logo Nakiros" width={32} height={32} className="block" />
          </button>
          <div className="flex min-w-0 items-center gap-1.5">
            <div aria-label={t('openedWorkspaceTabs')} className="flex min-w-0 max-w-[min(62vw,760px)] items-center gap-1.5 overflow-x-auto">
              {openWorkspaces.map((openedWorkspace) => {
                const isActive = openedWorkspace.id === activeWorkspaceId;
                const hasChatCompletion = (chatCompletionNotices[openedWorkspace.id] ?? 0) > 0;
                return (
                  <div
                    key={openedWorkspace.id}
                    className={clsx(
                      'flex min-w-0 items-center rounded-[10px] border',
                      isActive
                        ? 'border-[var(--line-strong)] bg-[var(--bg-card)]'
                        : 'border-[var(--line)] bg-[var(--bg-soft)]',
                    )}
                  >
                    <button
                      onClick={() => openWorkspaceTab(openedWorkspace.id)}
                      title={openedWorkspace.name}
                      className="flex max-w-[220px] min-w-0 items-center gap-1.5 border-none bg-transparent px-[10px] py-1.5 text-[13px] font-semibold text-[var(--text)]"
                    >
                      <span className="truncate">{openedWorkspace.name}</span>
                      {hasChatCompletion && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#14b8a6]" />
                      )}
                    </button>
                    <button
                      onClick={() => closeWorkspaceTab(openedWorkspace.id)}
                      title={`${t('closeTab')} ${openedWorkspace.name}`}
                      aria-label={`${t('closeTab')} ${openedWorkspace.name}`}
                      className="h-[26px] w-[26px] shrink-0 border-0 border-l border-solid border-l-[var(--line)] bg-transparent p-0 text-sm leading-none text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <div ref={workspaceMenuRef} className="relative shrink-0">
              <button
                ref={workspaceMenuButtonRef}
                onClick={toggleWorkspaceMenu}
                title={t('openWorkspace')}
                aria-label={t('openWorkspace')}
                className="h-7 w-7 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-0 text-lg leading-none text-[var(--text)]"
              >
                +
              </button>
              {isWorkspaceMenuOpen && (
                <div
                  className={clsx(
                    'absolute top-[34px] z-[200] max-h-[280px] w-[260px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-1.5',
                    workspaceMenuPositionClass,
                  )}
                >
                  {unopenedWorkspaces.length > 0 ? (
                    unopenedWorkspaces.map((candidate) => (
                      <button
                        key={candidate.id}
                        onClick={() => {
                          openWorkspaceTab(candidate.id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                        className="w-full rounded-lg border-none bg-transparent px-[10px] py-2 text-left text-[13px] text-[var(--text)]"
                      >
                        {candidate.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-[10px] py-2 text-xs text-[var(--text-muted)]">{t('noOtherWorkspace')}</div>
                  )}
                  <button
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false);
                      onNewWorkspace();
                    }}
                    className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-[10px] py-2 text-left text-[13px] font-bold text-[var(--text)]"
                  >
                    + {t('newWorkspace')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowFeedbackModal(true)}
            title={tFeedback('productTitle')}
            className="rounded-lg border border-[var(--line)] bg-transparent px-[9px] py-1 text-[11px] text-[var(--text-muted)]"
          >
            {tFeedback('productButton')}
          </button>
          <button
            onClick={() => {
              setGlobalSettingsSection('general');
              setShowGlobalSettings((prev) => !prev);
            }}
            title={tSettings('title')}
            aria-label={tSettings('title')}
            className={clsx(
              'grid h-7 w-7 place-items-center rounded-lg p-0',
              showGlobalSettings
                ? 'border border-[var(--primary)] bg-[var(--bg-muted)]'
                : 'border border-[var(--line)] bg-transparent',
            )}
          >
            <Settings2 size={14} color={showGlobalSettings ? 'var(--primary)' : 'var(--text-muted)'} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={activeTab}
          onChange={setActiveTab}
          chatHasCompletionNotice={activeWorkspaceHasChatCompletion && activeTab !== 'chat'}
          chatHasPendingPreview={activeWorkspaceHasPendingPreview && activeTab !== 'chat'}
          labels={{
            overview: tSidebar('overview'),
            chat: tSidebar('chat'),
            product: tSidebar('product'),
            delivery: tSidebar('delivery'),
            backlog: tSidebar('backlog'),
            settings: tSidebar('settings'),
          }}
        />

        <DashboardErrorBoundary resetKey={`${workspace.id}:${activeTab}:${showGlobalSettings ? 'settings' : 'main'}`}>
          <div className="flex flex-1 overflow-hidden">
            <DashboardRouter
              showGlobalSettings={showGlobalSettings}
              globalSettingsSection={globalSettingsSection}
              activeTab={activeTab}
              workspace={workspace}
              openWorkspaces={openWorkspaces}
              openAgentRunChatTarget={reviewOpenChatTarget ?? openAgentRunChatTarget}
              tickets={tickets}
              epics={epics}
              repoNames={repoNames}
              serverStatus={serverStatus}
              workspaceSyncState={workspaceSyncState}
              overviewDocsCount={overviewDocsCount}
              overviewConversationCount={overviewConversationCount}
              lastConversationAt={lastConversationAt}
              openPrdAssistantSignal={openPrdAssistantSignal}
              selectedTicket={selectedTicket}
              copyingId={copyingId}
              defaultProvider={defaultProvider}
              onSetActiveTab={setActiveTab}
              onSetSelectedTicket={setSelectedTicket}
              onSetOverviewDocsCount={setOverviewDocsCount}
              onTicketUpdate={handleTicketUpdate}
              onTicketCreate={handleTicketCreate}
              onContextCopy={handleContextCopy}
              onContextCopied={(ticketId) => pushToast(tToast('contextCopied', { ticketId }))}
              onUpdateWorkspace={onUpdateWorkspace}
              onRefreshTickets={() => {
                void refreshTickets();
              }}
              onRefreshOverviewData={() => {
                void refreshOverviewData();
              }}
              onGoHome={onGoHome}
              onOpenPrdAssistant={() => {
                setActiveTab('product');
                setOpenPrdAssistantSignal((prev) => prev + 1);
              }}
              onCloseGlobalSettings={() => setShowGlobalSettings(false)}
              onGlobalUpdateApplied={onDismissUpdateBanner}
              onChatRunCompletionNoticeChange={handleChatRunCompletionNoticeChange}
              onChatPendingPreviewChange={handleChatPendingPreviewChange}
              launchChatRequest={contextLaunchRequest ?? launchChatRequest}
              onLaunchChatRequest={setContextLaunchRequest}
              onArtifactChangeProposal={handleArtifactChangeProposal}
              lastArtifactReviewMutation={lastArtifactReviewMutation}
              onFileChangesDetected={openFileChangesSession}
              showSetupBanner={onboardingIncomplete && !setupBannerDismissed}
              onOpenGettingStarted={() => onGoGettingStarted(workspace.id)}
              onDismissSetupBanner={() => setSetupBannerDismissed(true)}
            />
            {activeArtifactReviewSession && isArtifactReviewDockOpen && (
              <ArtifactReviewDock
                session={activeArtifactReviewSession}
                isMutating={isArtifactReviewMutating}
                onClose={closeArtifactReviewDock}
                onAccept={() => void acceptActiveArtifactReview()}
                onReject={() => void rejectActiveArtifactReview()}
                onAskForChanges={handleAskForArtifactChanges}
              />
            )}
            {activeFileChangesSession && isFileChangesDockOpen && (
              <FileChangesReviewDock
                session={activeFileChangesSession}
                isMutating={isFileChangesMutating}
                onClose={closeFileChangesDock}
                onAcceptAll={() => void acceptAllFileChanges()}
                onRejectAll={() => void rejectAllFileChanges()}
                onAcceptFile={(path) => void acceptFileChange(path)}
                onRejectFile={(path) => void rejectFileChange(path)}
              />
            )}
          </div>
        </DashboardErrorBoundary>
      </div>
      <StatusBar
        authState={authState}
        serverStatus={serverStatus}
        workspaceSyncState={workspaceSyncState}
        repoCount={workspace.repos.length}
        topology={workspaceTopology}
      />
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          onToast={pushToast}
        />
      )}
      {toast && (
        <div className="fixed bottom-[14px] right-4 z-[1200] rounded-[10px] bg-[#0f172a] px-3 py-[9px] text-xs text-white shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
      {canReopenArtifactReviewDock && (
        <Button
          type="button"
          onClick={reopenArtifactReviewDock}
          variant="outline"
          className="fixed bottom-[54px] right-4 z-[1190] h-auto max-w-[320px] justify-start gap-2 px-3 py-2 text-left"
        >
          <Eye data-icon="inline-start" />
          <span className="truncate">{tContext('artifactReviewReopenActive', { title: activeArtifactReviewSession?.title ?? '' })}</span>
        </Button>
      )}
      {canReopenFileChangesDock && (
        <Button
          type="button"
          onClick={reopenFileChangesDock}
          variant="outline"
          className="fixed bottom-[54px] right-4 z-[1190] h-auto max-w-[320px] justify-start gap-2 px-3 py-2 text-left"
        >
          <Eye data-icon="inline-start" />
          <span className="truncate">{tContext('fileChangesReopenDock', 'Agent file changes — review pending')}</span>
        </Button>
      )}
    </div>
  );
}
