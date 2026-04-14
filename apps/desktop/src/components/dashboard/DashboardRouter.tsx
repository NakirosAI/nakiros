import type {
  ArtifactChangeProposal,
  AgentProvider,
  FileChangesReviewSession,
  LocalEpic,
  LocalTicket,
  OnboardingChatLaunchRequest,
  StoredWorkspace,
} from '@nakiros/shared';
import GlobalSettings, { type GlobalSettingsSection } from '../GlobalSettings';
import ProductView from '../../views/ProductView';
import ProjectSettings from '../ProjectSettings';
import WorkspaceOverview from '../WorkspaceOverview';
import type { SidebarTab } from '../Sidebar';
import ChatView from '../../views/ChatView';
import type { ArtifactReviewMutation } from '../../hooks/useArtifactReview';

interface DashboardRouterProps {
  showGlobalSettings: boolean;
  globalSettingsSection: GlobalSettingsSection;
  activeTab: SidebarTab;
  workspace: StoredWorkspace;
  openWorkspaces: StoredWorkspace[];
  openAgentRunChatTarget?: OpenAgentRunChatPayload | null;
  launchChatRequest?: OnboardingChatLaunchRequest | null;
  tickets: LocalTicket[];
  epics: LocalEpic[];
  repoNames: string[];
  serverStatus: 'starting' | 'running' | 'stopped';
  overviewDocsCount: number;
  overviewConversationCount: number;
  lastConversationAt: string | null;
  openPrdAssistantSignal: number;
  selectedTicket: LocalTicket | null;
  copyingId: string | null;
  defaultProvider: AgentProvider;
  onSetActiveTab(tab: SidebarTab): void;
  onSetSelectedTicket(ticket: LocalTicket | null): void;
  onSetOverviewDocsCount(count: number): void;
  onTicketUpdate(updated: LocalTicket): void;
  onTicketCreate(ticket: LocalTicket): void;
  onContextCopy(): void;
  onContextCopied(ticketId: string): void;
  onUpdateWorkspace(workspace: StoredWorkspace): Promise<void>;
  onRefreshTickets(): void;
  onRefreshOverviewData(): void;
  onGoHome(): void;
  onOpenPrdAssistant(): void;
  onCloseGlobalSettings(): void;
  onGlobalUpdateApplied(): void;
  onChatRunCompletionNoticeChange(workspaceId: string, pendingCount: number): void;
  onChatPendingPreviewChange?(workspaceId: string, hasPendingPreview: boolean): void;
  onArtifactChangeProposal(
    sourceSurface: 'chat' | 'product' | 'backlog',
    event: {
      proposal: ArtifactChangeProposal;
      conversationId?: string | null;
      triggerMessageId?: string | null;
      baselineContentOverride?: string | null;
      alreadyApplied?: boolean;
    },
  ): void;
  lastArtifactReviewMutation: ArtifactReviewMutation | null;
  onFileChangesDetected?: (session: FileChangesReviewSession) => void;
  showSetupBanner?: boolean;
  onOpenGettingStarted?(): void;
  onDismissSetupBanner?(): void;
  onLaunchChatRequest?(request: OnboardingChatLaunchRequest): void;
}

export function DashboardRouter({
  showGlobalSettings,
  globalSettingsSection,
  activeTab,
  workspace,
  openWorkspaces,
  openAgentRunChatTarget,
  tickets,
  epics: _epics,
  repoNames: _repoNames,
  serverStatus,
  overviewDocsCount,
  overviewConversationCount,
  lastConversationAt,
  openPrdAssistantSignal,
  selectedTicket: _selectedTicket,
  copyingId: _copyingId,
  defaultProvider: _defaultProvider,
  onSetActiveTab,
  onSetSelectedTicket: _onSetSelectedTicket,
  onSetOverviewDocsCount,
  onTicketUpdate: _onTicketUpdate,
  onTicketCreate: _onTicketCreate,
  onContextCopy: _onContextCopy,
  onContextCopied: _onContextCopied,
  onUpdateWorkspace,
  onRefreshTickets,
  onRefreshOverviewData,
  onGoHome,
  onOpenPrdAssistant,
  onCloseGlobalSettings,
  onGlobalUpdateApplied,
  onChatRunCompletionNoticeChange,
  onChatPendingPreviewChange,
  onArtifactChangeProposal,
  lastArtifactReviewMutation,
  onFileChangesDetected,
  launchChatRequest,
  showSetupBanner,
  onOpenGettingStarted,
  onDismissSetupBanner,
  onLaunchChatRequest,
}: DashboardRouterProps) {
  const chatSelected = activeTab === 'chat';
  const overviewSelected = activeTab === 'overview';
  const productSelected = activeTab === 'product';
  const settingsSelected = activeTab === 'settings';

  return (
    <>
      {openWorkspaces.map((openedWorkspace) => (
        <div
          key={openedWorkspace.id}
          className={chatSelected && !showGlobalSettings && openedWorkspace.id === workspace.id ? 'flex min-w-0 flex-1 overflow-hidden' : 'hidden'}
        >
          <ChatView
            workspace={openedWorkspace}
            isVisible={chatSelected && !showGlobalSettings && openedWorkspace.id === workspace.id}
            onRunCompletionNoticeChange={onChatRunCompletionNoticeChange}
            onPendingPreviewChange={onChatPendingPreviewChange}
            openChatTarget={openAgentRunChatTarget}
            launchChatRequest={openedWorkspace.id === workspace.id ? launchChatRequest : null}
            onArtifactChangeProposal={(event) => onArtifactChangeProposal('chat', event)}
            onFileChangesDetected={onFileChangesDetected}
          />
        </div>
      ))}

      {showGlobalSettings && (
        <GlobalSettings
          onClose={onCloseGlobalSettings}
          initialSection={globalSettingsSection}
          onUpdateApplied={onGlobalUpdateApplied}
        />
      )}

      {!showGlobalSettings && overviewSelected && (
        <WorkspaceOverview
          workspace={workspace}
          tickets={tickets}
          docsCount={overviewDocsCount}
          conversationCount={overviewConversationCount}
          lastConversationAt={lastConversationAt}
          serverStatus={serverStatus}
          showSetupBanner={showSetupBanner}
          onGoProduct={() => onSetActiveTab('product')}
          onGoDelivery={() => onSetActiveTab('delivery')}
          onOpenChat={() => onSetActiveTab('chat')}
          onCreateTicket={() => onSetActiveTab('delivery')}
          onCreatePrd={onOpenPrdAssistant}
          onOpenGettingStarted={onOpenGettingStarted}
          onDismissSetupBanner={onDismissSetupBanner}
        />
      )}

      {!showGlobalSettings && productSelected && (
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <ProductView
            workspace={workspace}
            onLaunchChat={onLaunchChatRequest}
            onArtifactChangeProposal={(event) => onArtifactChangeProposal('product', event)}
            lastArtifactReviewMutation={lastArtifactReviewMutation}
          />
        </div>
      )}


      {!showGlobalSettings && settingsSelected && (
        <ProjectSettings
          workspace={workspace}
          onUpdate={onUpdateWorkspace}
          onTicketsRefresh={() => {
            onRefreshTickets();
            onRefreshOverviewData();
          }}
          onDelete={onGoHome}
        />
      )}
    </>
  );
}
