import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  LocalTicket,
  StoredWorkspace,
} from '@nakiros/shared';
import { Settings2 } from 'lucide-react';
import appIcon from '../assets/icon.svg';
import { DashboardRouter } from '../components/dashboard/DashboardRouter';
import FeedbackModal from '../components/FeedbackModal';
import Sidebar, { type SidebarTab } from '../components/Sidebar';
import { usePreferences } from '../hooks/usePreferences';
import { useTickets } from '../hooks/useTickets';
import { useWorkspace } from '../hooks/useWorkspace';

interface Props {
  onUpdateWorkspace(workspace: StoredWorkspace): Promise<void>;
  onNewWorkspace(): void;
  onGoHome(): void;
  serverStatus: 'starting' | 'running' | 'stopped';
  onRestartServer(): void;
}

export default function Dashboard({
  onUpdateWorkspace,
  onNewWorkspace,
  onGoHome,
  serverStatus,
  onRestartServer,
}: Props) {
  const { t } = useTranslation('dashboard');
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

  const mcpUrl = preferences.mcpServerUrl || 'http://localhost:3737';
  const isLocalServer = mcpUrl.includes('localhost') || mcpUrl.includes('127.0.0.1');
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
  const toastTimerRef = useRef<number | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
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

  const repoNames = workspace.repos.map((repo) => repo.name);
  const workspaceTopology = workspace.topology ?? (workspace.repos.length > 1 ? 'multi' : 'mono');
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
                      className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap border-none bg-transparent px-[10px] py-1.5 text-[13px] font-semibold text-[var(--text)]"
                    >
                      {openedWorkspace.name}
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
          <span className="text-xs text-[var(--text-muted)]">{t('repoCount', { count: workspace.repos.length })}</span>
          <span className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-2 py-[3px] text-[11px] text-[var(--text-muted)]">
            {workspaceTopology === 'mono' ? t('topologyMono') : t('topologyMulti')}
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
            className={clsx(
              'flex items-center gap-[5px] rounded-lg border-none bg-transparent px-2 py-1',
              (!isLocalServer || serverStatus === 'starting') && 'opacity-60',
            )}
          >
            <span
              className={clsx(
                'h-[7px] w-[7px] shrink-0 rounded-full',
                serverStatus === 'running'
                  ? 'bg-[var(--success)]'
                  : serverStatus === 'starting'
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--danger)]',
              )}
            />
            <span className="text-[11px] text-[var(--text-muted)]">MCP</span>
          </button>
          <button
            onClick={() => setShowFeedbackModal(true)}
            title={tFeedback('productTitle')}
            className="rounded-lg border border-[var(--line)] bg-transparent px-[9px] py-1 text-[11px] text-[var(--text-muted)]"
          >
            {tFeedback('productButton')}
          </button>
          <button
            onClick={() => setShowGlobalSettings((prev) => !prev)}
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
          labels={{
            overview: tSidebar('overview'),
            chat: tSidebar('chat'),
            product: tSidebar('product'),
            delivery: tSidebar('delivery'),
            settings: tSidebar('settings'),
          }}
        />

        <div className="flex flex-1 overflow-hidden">
          <DashboardRouter
            showGlobalSettings={showGlobalSettings}
            activeTab={activeTab}
            workspace={workspace}
            tickets={tickets}
            epics={epics}
            repoNames={repoNames}
            serverStatus={serverStatus}
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
          />
        </div>
      </div>
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
    </div>
  );
}
