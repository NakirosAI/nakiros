import { useEffect, useRef, useState } from 'react';
import type {
  StoredWorkspace,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  ResolvedLanguage,
  ResolvedTheme,
} from '@tiqora/shared';
import Sidebar, { type SidebarTab } from '../components/Sidebar';
import KanbanBoard from '../components/KanbanBoard';
import TicketDetail from '../components/TicketDetail';
import RepoCard from '../components/RepoCard';
import GlobalSettings from '../components/GlobalSettings';
import ProjectSettings from '../components/ProjectSettings';
import AgentPanel from '../components/AgentPanel';
import appIcon from '../assets/icon.svg';
import { Settings2 } from 'lucide-react';
import { MESSAGES } from '../i18n';

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('board');
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [epics, setEpics] = useState<LocalEpic[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<LocalTicket | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuSide, setWorkspaceMenuSide] = useState<'left' | 'right'>('right');
  const toastTimerRef = useRef<number | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void window.tiqora.getTickets(workspace.id).then(setTickets);
    void window.tiqora.getEpics(workspace.id).then(setEpics);
    setSelectedTicket(null);
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

  function handleTicketUpdate(updated: LocalTicket) {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
  }

  function handleTicketCreate(ticket: LocalTicket) {
    setTickets((prev) => [...prev, ticket]);
  }

  async function handleContextCopy() {
    if (!selectedTicket) return;
    setCopyingId(selectedTicket.id);
    try {
      const ctx = await window.tiqora.generateContext(workspace.id, selectedTicket.id, workspace);
      await window.tiqora.writeClipboard(ctx);
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

  const repoNames = workspace.repos.map((r) => r.name);
  const unopenedWorkspaces = allWorkspaces.filter(
    (candidate) => !openWorkspaces.some((opened) => opened.id === candidate.id),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
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
          <button
            onClick={onGoHome}
            title={msg.dashboard.home}
            aria-label={msg.dashboard.home}
            style={logoButton}
          >
            <img
              src={appIcon}
              alt="Logo Tiqora"
              width={32}
              height={32}
              style={{ display: 'block' }}
            />
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
                    <button
                      onClick={() => onOpenWorkspaceTab(openedWorkspace.id)}
                      title={openedWorkspace.name}
                      style={tabSelectButton}
                    >
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {msg.dashboard.repoCount(workspace.repos.length)}
          </span>
          {workspace.mode && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'var(--bg-muted)',
                padding: '3px 8px',
                borderRadius: 2,
                border: '1px solid var(--line)',
              }}
            >
              {workspace.mode === 'solo' ? msg.dashboard.modeSolo : msg.dashboard.modeConnected}
            </span>
          )}
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
              borderRadius: 4,
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
            onClick={() => setShowGlobalSettings((prev) => !prev)}
            title={msg.settings.title}
            aria-label={msg.settings.title}
            style={globalSettingsButton}
          >
            <Settings2 size={14} color='var(--text-muted)' />
          </button>
        </div>
        {showGlobalSettings && (
          <GlobalSettings
            preferences={preferences}
            resolvedTheme={resolvedTheme}
            language={language}
            onChange={onPreferencesChange}
            onClose={() => setShowGlobalSettings(false)}
          />
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          active={activeTab}
          onChange={setActiveTab}
          labels={{
            board: msg.sidebar.board,
            repos: msg.sidebar.repos,
            agents: msg.sidebar.agents,
            settings: msg.sidebar.settings,
          }}
        />

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {activeTab === 'board' && (
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
                  workspaceId={workspace.id}
                  onUpdate={handleTicketUpdate}
                  onClose={() => setSelectedTicket(null)}
                  onContextCopy={handleContextCopy}
                  copying={copyingId === selectedTicket.id}
                />
              )}
            </>
          )}

          {activeTab === 'repos' && (
            <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
              {workspace.repos.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed var(--line-strong)',
                    background: 'var(--bg-soft)',
                    borderRadius: 2,
                    padding: 16,
                    color: 'var(--text-muted)',
                  }}
                >
                  {msg.dashboard.noRepo}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}
                >
                  {workspace.repos.map((repo) => (
                    <RepoCard key={repo.localPath} repo={repo} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'agents' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {workspace.repos.length === 0 ? (
                <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                  {msg.dashboard.noRepo}
                </div>
              ) : (
                <AgentPanel
                  repos={workspace.repos}
                  initialRepoPath={workspace.repos[0]?.localPath}
                />
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <ProjectSettings
              workspace={workspace}
              language={language}
              onUpdate={onUpdateWorkspace}
              onTicketsRefresh={() => {
                void window.tiqora.getTickets(workspace.id).then(setTickets);
                void window.tiqora.getEpics(workspace.id).then(setEpics);
              }}
            />
          )}
        </div>
      </div>
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 14,
            background: '#0f172a',
            color: '#fff',
            borderRadius: 2,
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
  borderRadius: 0,
  cursor: 'pointer',
  padding: 0,
};

const tabItem = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  border: active ? '1px solid var(--line-strong)' : '1px solid var(--line)',
  background: active ? 'var(--bg-card)' : 'var(--bg-soft)',
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
  cursor: 'pointer',
  padding: 0,
};
