import type {
  AgentProvider,
  LocalEpic,
  LocalTicket,
  StoredWorkspace,
} from '@nakiros/shared';
import ContextPanel from '../ContextPanel';
import GlobalSettings from '../GlobalSettings';
import KanbanBoard from '../KanbanBoard';
import ProjectSettings from '../ProjectSettings';
import TicketDetail from '../TicketDetail';
import WorkspaceOverview from '../WorkspaceOverview';
import type { SidebarTab } from '../Sidebar';
import ChatView from '../../views/ChatView';

interface DashboardRouterProps {
  showGlobalSettings: boolean;
  activeTab: SidebarTab;
  workspace: StoredWorkspace;
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
}

export function DashboardRouter({
  showGlobalSettings,
  activeTab,
  workspace,
  tickets,
  epics,
  repoNames,
  serverStatus,
  overviewDocsCount,
  overviewConversationCount,
  lastConversationAt,
  openPrdAssistantSignal,
  selectedTicket,
  copyingId,
  defaultProvider,
  onSetActiveTab,
  onSetSelectedTicket,
  onSetOverviewDocsCount,
  onTicketUpdate,
  onTicketCreate,
  onContextCopy,
  onContextCopied,
  onUpdateWorkspace,
  onRefreshTickets,
  onRefreshOverviewData,
  onGoHome,
  onOpenPrdAssistant,
  onCloseGlobalSettings,
}: DashboardRouterProps) {
  const deliverySelected = activeTab === 'delivery';

  if (showGlobalSettings) {
    return (
      <GlobalSettings
        onClose={onCloseGlobalSettings}
      />
    );
  }

  if (activeTab === 'overview') {
    return (
      <WorkspaceOverview
        workspace={workspace}
        tickets={tickets}
        docsCount={overviewDocsCount}
        conversationCount={overviewConversationCount}
        lastConversationAt={lastConversationAt}
        serverStatus={serverStatus}
        onGoProduct={() => onSetActiveTab('product')}
        onGoDelivery={() => onSetActiveTab('delivery')}
        onOpenChat={() => onSetActiveTab('chat')}
        onCreateTicket={() => onSetActiveTab('delivery')}
        onCreatePrd={onOpenPrdAssistant}
      />
    );
  }

  if (activeTab === 'chat') {
    return (
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <ChatView workspace={workspace} />
      </div>
    );
  }

  if (activeTab === 'product') {
    return (
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <ContextPanel
          workspace={workspace}
          onDocumentsChanged={onSetOverviewDocsCount}
          openPrdAssistantSignal={openPrdAssistantSignal}
          onOpenChat={() => onSetActiveTab('chat')}
        />
      </div>
    );
  }

  if (deliverySelected) {
    return (
      <>
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            workspace={workspace}
            tickets={tickets}
            epics={epics}
            onTicketUpdate={onTicketUpdate}
            onTicketCreate={onTicketCreate}
            onSelectTicket={onSetSelectedTicket}
            selectedTicketId={selectedTicket?.id}
            onContextCopied={onContextCopied}
          />
        </div>
        {selectedTicket && (
          <TicketDetail
            ticket={selectedTicket}
            allTickets={tickets}
            epics={epics}
            repos={repoNames}
            storedRepos={workspace.repos}
            workspaceId={workspace.id}
            workspace={workspace}
            onUpdate={onTicketUpdate}
            onClose={() => onSetSelectedTicket(null)}
            onContextCopy={onContextCopy}
            copying={copyingId === selectedTicket.id}
            defaultProvider={defaultProvider}
          />
        )}
      </>
    );
  }

  if (activeTab === 'settings') {
    return (
      <ProjectSettings
        workspace={workspace}
        onUpdate={onUpdateWorkspace}
        onTicketsRefresh={() => {
          onRefreshTickets();
          onRefreshOverviewData();
        }}
        onDelete={onGoHome}
      />
    );
  }

  return null;
}

