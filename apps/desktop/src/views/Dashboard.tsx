import { useEffect, useRef, useState } from 'react';
import type {
  AppPreferences,
  LocalEpic,
  LocalTicket,
  ResolvedLanguage,
  ResolvedTheme,
  StoredWorkspace,
} from '@nakiros/shared';
import { Settings2 } from 'lucide-react';
import appIcon from '../assets/icon.svg';
import ContextPanel from '../components/ContextPanel';
import FeedbackModal from '../components/FeedbackModal';
import GlobalSettings from '../components/GlobalSettings';
import KanbanBoard from '../components/KanbanBoard';
import ProjectSettings from '../components/ProjectSettings';
import Sidebar, { type SidebarTab } from '../components/Sidebar';
import TicketDetail from '../components/TicketDetail';
import WorkspaceOverview from '../components/WorkspaceOverview';
import { MESSAGES } from '../i18n';
import ChatView from './ChatView';

interface Props {
  workspace: StoredWorkspace;
  openWorkspaces: StoredWorkspace[];
  activeWorkspaceId: string;
  allWorkspaces: StoredWorkspace[];
  preferences: AppPreferences;
  resolvedTheme: ResolvedTheme;
  language: ResolvedLanguage;
  onPreferencesChange(next: AppPreferences): Promise<void>;
  onUpdateWorkspace(workspace: StoredWorkspace): Promise<void>;
  onOpenWorkspaceTab(id: string): void;
  onCloseWorkspaceTab(id: string): void;
  onNewWorkspace(): void;
  onGoHome(): void;
  serverStatus: 'starting' | 'running' | 'stopped';
  onRestartServer(): void;
}

export default function Dashboard({
  workspace,
  openWorkspaces,
  activeWorkspaceId,
  allWorkspaces,
  preferences,
  resolvedTheme,
  language,
  onPreferencesChange,
  onUpdateWorkspace,
  onOpenWorkspaceTab,
  onCloseWorkspaceTab,
  onNewWorkspace,
  onGoHome,
  serverStatus,
  onRestartServer,
}: Props) {
  const msg = MESSAGES[language];
  const mcpUrl = preferences.mcpServerUrl || 'http://localhost:3737';
  const isLocalServer = mcpUrl.includes('localhost') || mcpUrl.includes('127.0.0.1');
  const defaultProvider = preferences.agentProvider ?? 'claude';

  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [epics, setEpics] = useState<LocalEpic[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<LocalTicket | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuSide, setWorkspaceMenuSide] = useState<'left' | 'right'>('right');
  const [overviewDocsCount, setOverviewDocsCount] = useState(0);
  const [overviewConversationCount, setOverviewConversationCount] = useState(0);
  const [lastConversationAt, setLastConversationAt] = useState<string | null>(null);
  const [openPrdAssistantSignal, setOpenPrdAssistantSignal] = useState(0);
  const toastTimerRef = useRef<number | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void window.nakiros.getTickets(workspace.id).then(setTickets);
    void window.nakiros.getEpics(workspace.id).then(setEpics);
    setSelectedTicket(null);
  }, [workspace.id]);

  useEffect(() => {
    void refreshOverviewData();
    setOverviewDocsCount(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

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
    setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
    if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
  }

  function handleTicketCreate(ticket: LocalTicket) {
    setTickets((prev) => [...prev, ticket]);
  }

  async function handleContextCopy() {
    if (!selectedTicket) return;
    setCopyingId(selectedTicket.id);
    try {
      const context = await window.nakiros.generateContext(workspace.id, selectedTicket.id, workspace);
      await window.nakiros.writeClipboard(context);
      pushToast(msg.toast.contextCopied(selectedTicket.id));
    } catch {
      pushToast(msg.toast.contextCopyError);
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

  const repoNames = workspace.repos.map((repo) => repo.name);
  const workspaceTopology = workspace.topology ?? (workspace.repos.length > 1 ? 'multi' : 'mono');
  const unopenedWorkspaces = allWorkspaces.filter(
    (candidate) => !openWorkspaces.some((openedWorkspace) => openedWorkspace.id === candidate.id),
  );
  const workspaceMenuPositionStyle =
    workspaceMenuSide === 'right'
      ? { left: 0 as const, right: 'auto' as const }
      : { right: 0 as const, left: 'auto' as const };

  function toggleWorkspaceMenu() {
    const rect = workspaceMenuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const buttonCenter = rect.left + rect.width / 2;
      setWorkspaceMenuSide(buttonCenter <= window.innerWidth / 2 ? 'right' : 'left');
    }
    setIsWorkspaceMenuOpen((prev) => !prev);
  }

  const deliverySelected = activeTab === 'delivery';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          height: 56,
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg-soft)',
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button onClick={onGoHome} title={msg.dashboard.home} aria-label={msg.dashboard.home} style={logoButton}>
            <img src={appIcon} alt="Logo Nakiros" width={32} height={32} style={{ display: 'block' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div
              aria-label={msg.dashboard.openedWorkspaceTabs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                maxWidth: 'min(62vw, 760px)',
                overflowX: 'auto',
              }}
            >
              {openWorkspaces.map((openedWorkspace) => {
                const isActive = openedWorkspace.id === activeWorkspaceId;
                return (
                  <div key={openedWorkspace.id} style={tabItem(isActive)}>
                    <button onClick={() => onOpenWorkspaceTab(openedWorkspace.id)} title={openedWorkspace.name} style={tabSelectButton}>
                      {openedWorkspace.name}
                    </button>
                    <button
                      onClick={() => onCloseWorkspaceTab(openedWorkspace.id)}
                      title={`${msg.dashboard.closeTab} ${openedWorkspace.name}`}
                      aria-label={`${msg.dashboard.closeTab} ${openedWorkspace.name}`}
                      style={tabCloseButton}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <div ref={workspaceMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                ref={workspaceMenuButtonRef}
                onClick={toggleWorkspaceMenu}
                title={msg.dashboard.openWorkspace}
                aria-label={msg.dashboard.openWorkspace}
                style={tabAddButton}
              >
                +
              </button>
              {isWorkspaceMenuOpen && (
                <div style={{ ...workspaceMenu, ...workspaceMenuPositionStyle }}>
                  {unopenedWorkspaces.length > 0 ? (
                    unopenedWorkspaces.map((candidate) => (
                      <button
                        key={candidate.id}
                        onClick={() => {
                          onOpenWorkspaceTab(candidate.id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                        style={workspaceMenuItem}
                      >
                        {candidate.name}
                      </button>
                    ))
                  ) : (
                    <div style={workspaceMenuEmpty}>{msg.dashboard.noOtherWorkspace}</div>
                  )}
                  <button
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false);
                      onNewWorkspace();
                    }}
                    style={workspaceMenuAction}
                  >
                    + {msg.dashboard.newWorkspace}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setActiveTab('chat')}
            disabled={workspace.repos.length === 0}
            title={workspace.repos.length === 0 ? msg.dashboard.noRepo : msg.dashboard.chatAgent}
            style={{
              border: '1px solid var(--line)',
              background: 'var(--bg-soft)',
              color: 'var(--text)',
              borderRadius: 10,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: workspace.repos.length === 0 ? 'not-allowed' : 'pointer',
              opacity: workspace.repos.length === 0 ? 0.55 : 1,
            }}
          >
            {msg.dashboard.chatAgent}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{msg.dashboard.repoCount(workspace.repos.length)}</span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'var(--bg-muted)',
              padding: '3px 8px',
              borderRadius: 8,
              border: '1px solid var(--line)',
            }}
          >
            {workspaceTopology === 'mono' ? msg.dashboard.topologyMono : msg.dashboard.topologyMulti}
          </span>
          <button
            onClick={isLocalServer ? onRestartServer : undefined}
            disabled={!isLocalServer || serverStatus === 'starting'}
            title={
              !isLocalServer
                ? `MCP ${serverStatus === 'running' ? 'running' : 'stopped'} (remote server)`
                : serverStatus === 'running'
                  ? 'MCP running — click to restart'
                  : serverStatus === 'starting'
                    ? 'MCP starting…'
                    : 'MCP stopped — click to restart'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: 'none',
              cursor: !isLocalServer || serverStatus === 'starting' ? 'default' : 'pointer',
              padding: '4px 8px',
              borderRadius: 8,
              opacity: !isLocalServer || serverStatus === 'starting' ? 0.6 : 1,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background:
                  serverStatus === 'running'
                    ? 'var(--success)'
                    : serverStatus === 'starting'
                      ? 'var(--warning)'
                      : 'var(--danger)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>MCP</span>
          </button>
          <button
            onClick={() => setShowFeedbackModal(true)}
            title={msg.feedback.productTitle}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              fontSize: 11,
              padding: '4px 9px',
              cursor: 'pointer',
            }}
          >
            {msg.feedback.productButton}
          </button>
          <button
            onClick={() => setShowGlobalSettings((prev) => !prev)}
            title={msg.settings.title}
            aria-label={msg.settings.title}
            style={{
              ...globalSettingsButton,
              background: showGlobalSettings ? 'var(--bg-muted)' : 'transparent',
              border: showGlobalSettings ? '1px solid var(--primary)' : '1px solid var(--line)',
            }}
          >
            <Settings2 size={14} color={showGlobalSettings ? 'var(--primary)' : 'var(--text-muted)'} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          active={activeTab}
          onChange={setActiveTab}
          labels={{
            overview: msg.sidebar.overview,
            chat: msg.sidebar.chat,
            product: msg.sidebar.product,
            delivery: msg.sidebar.delivery,
            settings: msg.sidebar.settings,
          }}
        />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {showGlobalSettings && (
            <GlobalSettings
              preferences={preferences}
              resolvedTheme={resolvedTheme}
              language={language}
              onChange={onPreferencesChange}
              onClose={() => setShowGlobalSettings(false)}
            />
          )}

          {!showGlobalSettings && activeTab === 'overview' && (
            <WorkspaceOverview
              workspace={workspace}
              tickets={tickets}
              docsCount={overviewDocsCount}
              conversationCount={overviewConversationCount}
              lastConversationAt={lastConversationAt}
              serverStatus={serverStatus}
              onGoProduct={() => setActiveTab('product')}
              onGoDelivery={() => setActiveTab('delivery')}
              onOpenChat={() => setActiveTab('chat')}
              onCreateTicket={() => setActiveTab('delivery')}
              onCreatePrd={() => {
                setActiveTab('product');
                setOpenPrdAssistantSignal((prev) => prev + 1);
              }}
              language={language}
            />
          )}

          {!showGlobalSettings && activeTab === 'chat' && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
              <ChatView workspace={workspace} lang={language} />
            </div>
          )}

          {!showGlobalSettings && activeTab === 'product' && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
              <ContextPanel
                workspace={workspace}
                language={language}
                onDocumentsChanged={(docsCount) => {
                  setOverviewDocsCount(docsCount);
                }}
                openPrdAssistantSignal={openPrdAssistantSignal}
                onOpenChat={() => setActiveTab('chat')}
              />
            </div>
          )}

          {!showGlobalSettings && deliverySelected && (
            <>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <KanbanBoard
                  workspace={workspace}
                  tickets={tickets}
                  epics={epics}
                  onTicketUpdate={handleTicketUpdate}
                  onTicketCreate={handleTicketCreate}
                  onSelectTicket={setSelectedTicket}
                  selectedTicketId={selectedTicket?.id}
                  onContextCopied={(ticketId) => pushToast(msg.toast.contextCopied(ticketId))}
                  language={language}
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
                  onUpdate={handleTicketUpdate}
                  onClose={() => setSelectedTicket(null)}
                  onContextCopy={handleContextCopy}
                  copying={copyingId === selectedTicket.id}
                  defaultProvider={defaultProvider}
                  language={language}
                />
              )}
            </>
          )}

          {!showGlobalSettings && activeTab === 'settings' && (
            <ProjectSettings
              workspace={workspace}
              language={language}
              onUpdate={onUpdateWorkspace}
              onTicketsRefresh={() => {
                void window.nakiros.getTickets(workspace.id).then(setTickets);
                void window.nakiros.getEpics(workspace.id).then(setEpics);
                void refreshOverviewData();
              }}
              onDelete={onGoHome}
            />
          )}
        </div>
      </div>
      {showFeedbackModal && (
        <FeedbackModal
          lang={language}
          onClose={() => setShowFeedbackModal(false)}
          onToast={pushToast}
        />
      )}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 14,
            background: '#0f172a',
            color: '#fff',
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 12,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1200,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const logoButton: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  padding: 0,
};

const tabItem = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  border: active ? '1px solid var(--line-strong)' : '1px solid var(--line)',
  background: active ? 'var(--bg-card)' : 'var(--bg-soft)',
  borderRadius: 10,
  minWidth: 0,
});

const tabSelectButton: React.CSSProperties = {
  maxWidth: 220,
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const tabCloseButton: React.CSSProperties = {
  width: 26,
  height: 26,
  border: 'none',
  borderLeft: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};

const tabAddButton: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
};

const workspaceMenu: React.CSSProperties = {
  position: 'absolute',
  top: 34,
  width: 260,
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: 280,
  overflowY: 'auto',
  background: 'var(--bg-card)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  boxShadow: 'var(--shadow-lg)',
  padding: 6,
  zIndex: 200,
};

const workspaceMenuItem: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};

const workspaceMenuAction: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 6,
};

const workspaceMenuEmpty: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  padding: '8px 10px',
};

const globalSettingsButton: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  background: 'transparent',
  border: '1px solid var(--line)',
  borderRadius: 8,
  cursor: 'pointer',
  padding: 0,
};
