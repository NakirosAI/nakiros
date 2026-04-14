import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OnboardingChatLaunchRequest,
  StoredWorkspace,
  AppPreferences,
} from '@nakiros/shared';
import Home from './views/Home';
import Onboarding from './views/Onboarding';
import WorkspaceSetup from './views/WorkspaceSetup';
import WorkspaceGettingStarted from './views/WorkspaceGettingStarted';
import Dashboard from './views/Dashboard';
import { resolveLanguage } from './utils/language';
import { syncWorkspaceArtifacts } from './utils/workspace-sync';
import i18n from './i18n/index';
import { useIpcListener } from './hooks/useIpcListener';
import { PreferencesProvider } from './hooks/usePreferences';
import { WorkspaceProvider } from './hooks/useWorkspace';

const FALLBACK_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
  agentProvider: 'claude',
  agentChannel: 'stable',
  desktopNotificationsEnabled: true,
  desktopNotificationMinDurationSeconds: 60,
};

type View =
  | { name: 'loading' }
  | { name: 'onboarding' }
  | { name: 'getting-started'; workspaceId: string }
  | { name: 'home' }
  | { name: 'setup'; initialDirectory?: string }
  | { name: 'dashboard' };

export default function App() {
  const { t } = useTranslation('common');
  const [view, setView] = useState<View>({ name: 'loading' });
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([]);
  const [openedWorkspaceIds, setOpenedWorkspaceIds] = useState<string[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(FALLBACK_PREFERENCES);
  const [serverStatus, setServerStatus] = useState<'starting' | 'running' | 'stopped'>('starting');
  const [openAgentRunChatTarget, setOpenAgentRunChatTarget] = useState<OpenAgentRunChatPayload | null>(null);
  const [pendingLaunchRequest, setPendingLaunchRequest] = useState<OnboardingChatLaunchRequest | null>(null);

  async function bootWorkspaces() {
    try {
      const [ws, prefs, status, configExists] = await Promise.all([
        window.nakiros.getWorkspaces(),
        window.nakiros.getPreferences(),
        window.nakiros.getServerStatus(),
        window.nakiros.nakirosConfigExists(),
      ]);
      setWorkspaces(ws);
      const resolvedPrefs: AppPreferences = {
        theme: 'dark',
        language: prefs.language ?? 'system',
        updatedAt: prefs.updatedAt ?? '',
        mcpServerUrl: prefs.mcpServerUrl,
        agentProvider: prefs.agentProvider ?? 'claude',
        agentChannel: prefs.agentChannel ?? 'stable',
        desktopNotificationsEnabled: prefs.desktopNotificationsEnabled !== false,
        desktopNotificationMinDurationSeconds: prefs.desktopNotificationMinDurationSeconds ?? 60,
      };
      setPreferences(resolvedPrefs);
      void i18n.changeLanguage(resolveLanguage(resolvedPrefs.language));
      setServerStatus(status);
      setBootError(null);
      if (!configExists) {
        setView({ name: 'onboarding' });
        return;
      }
      // Restore last opened workspace so the user lands back where they left off
      const lastOpened = ws.length > 0
        ? [...ws].sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())[0]!
        : null;
      if (lastOpened) {
        setOpenedWorkspaceIds([lastOpened.id]);
        setActiveWorkspaceId(lastOpened.id);
        setView({ name: 'dashboard' });
        return;
      }
    } catch (err) {
      setBootError(t('workspaceLoadError'));
    } finally {
      setView((current) => (
        current.name === 'loading'
          ? { name: 'home' }
          : current
      ));
    }
  }

  useEffect(() => {
    void bootWorkspaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useIpcListener(window.nakiros.onServerStatusChange, setServerStatus);
  useIpcListener(window.nakiros.onOpenAgentRunChat, (payload) => {
    const target: OpenAgentRunChatPayload = {
      ...payload,
      eventId: payload.eventId ?? `notif-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    };
    const workspaceExists = workspaces.some((item) => item.id === target.workspaceId);
    if (!workspaceExists) return;
    setOpenAgentRunChatTarget(target);
    setOpenedWorkspaceIds((prev) => (prev.includes(target.workspaceId) ? prev : [...prev, target.workspaceId]));
    setActiveWorkspaceId(target.workspaceId);
    setView({ name: 'dashboard' });
  }, [workspaces]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    if (view.name !== 'dashboard') return;

    const existingIds = openedWorkspaceIds.filter((id) => workspaces.some((w) => w.id === id));
    if (existingIds.length !== openedWorkspaceIds.length) {
      setOpenedWorkspaceIds(existingIds);
      return;
    }

    if (activeWorkspaceId && existingIds.includes(activeWorkspaceId)) return;
    if (existingIds.length > 0) {
      setActiveWorkspaceId(existingIds[0]!);
      return;
    }

    setActiveWorkspaceId(null);
    setView({ name: 'home' });
  }, [view, openedWorkspaceIds, activeWorkspaceId, workspaces]);

  async function openWorkspace(ws: StoredWorkspace) {
    const workspacePath = ws.workspacePath ?? ws.repos[0]?.localPath;
    const updated: StoredWorkspace = {
      ...ws,
      workspacePath,
      lastOpenedAt: new Date().toISOString(),
    };
    try {
      await window.nakiros.saveWorkspace(updated);
    } catch {
      // Offline workspace access should still succeed
    }
    setWorkspaces((prev) => {
      const found = prev.some((w) => w.id === updated.id);
      if (!found) return [...prev, updated];
      return prev.map((w) => (w.id === updated.id ? updated : w));
    });
    setOpenedWorkspaceIds((prev) => (prev.includes(updated.id) ? prev : [...prev, updated.id]));
    setActiveWorkspaceId(updated.id);
    setView({ name: 'dashboard' });
  }

  async function handleWorkspaceCreated(workspace: StoredWorkspace) {
    const updated = await window.nakiros.getWorkspaces();
    setWorkspaces(updated);
    setOpenedWorkspaceIds((prev) => (prev.includes(workspace.id) ? prev : [...prev, workspace.id]));
    setActiveWorkspaceId(workspace.id);
    setView({ name: 'getting-started', workspaceId: workspace.id });
  }

  function handleOpenWorkspaceTab(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setOpenedWorkspaceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveWorkspaceId(id);
    setView({ name: 'dashboard' });
    void openWorkspace(ws);
  }

  function handleCloseWorkspaceTab(id: string) {
    setOpenedWorkspaceIds((prev) => {
      const next = prev.filter((workspaceId) => workspaceId !== id);
      setActiveWorkspaceId((current) => {
        if (current !== id) return current;
        return next.length > 0 ? next[next.length - 1]! : null;
      });
      if (next.length === 0) setView({ name: 'home' });
      return next;
    });
  }

  async function handlePreferencesChange(next: AppPreferences) {
    const withTimestamp: AppPreferences = { ...next, updatedAt: new Date().toISOString() };
    await window.nakiros.savePreferences(withTimestamp);
    setPreferences(withTimestamp);
    void i18n.changeLanguage(resolveLanguage(withTimestamp.language));
  }

  async function handleUpdateWorkspace(updated: StoredWorkspace) {
    await window.nakiros.saveWorkspace(updated);
    await syncWorkspaceArtifacts(updated);
    const fresh = await window.nakiros.getWorkspaces();
    setWorkspaces(fresh);
    setOpenedWorkspaceIds((prev) => prev.filter((id) => fresh.some((workspace) => workspace.id === id)));
    if (activeWorkspaceId === updated.id && !fresh.some((workspace) => workspace.id === updated.id)) {
      setActiveWorkspaceId(null);
    }
  }

  if (view.name === 'loading') {
    return (
      <div className="grid h-screen place-items-center font-semibold text-[var(--text-muted)]">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
          {t('loadingWorkspace')}
        </div>
      </div>
    );
  }

  if (view.name === 'onboarding') {
    return (
      <Onboarding
        onDone={() => setView({ name: 'setup' })}
      />
    );
  }

  if (view.name === 'getting-started') {
    const createdWorkspace = workspaces.find((workspace) => workspace.id === view.workspaceId);
    if (!createdWorkspace) {
      return <div className="p-5 text-[var(--text-muted)]">{t('loadingWorkspace')}</div>;
    }

    return (
      <WorkspaceGettingStarted
        workspace={createdWorkspace}
        onLaunchChat={(request) => {
          setPendingLaunchRequest(request);
          void openWorkspace(createdWorkspace);
        }}
        onContinue={() => {
          void openWorkspace(createdWorkspace);
        }}
        onBackHome={() => setView({ name: 'home' })}
      />
    );
  }

  if (view.name === 'home') {
    const sorted = [...workspaces].sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
    );
    return (
      <Home
        recentWorkspaces={sorted}
        bootError={bootError ?? undefined}
        onNewWorkspace={() => setView({ name: 'setup' })}
        onOpenWorkspace={(id) => {
          const ws = workspaces.find((w) => w.id === id);
          if (ws) void openWorkspace(ws);
        }}
      />
    );
  }

  if (view.name === 'setup') {
    return (
      <WorkspaceSetup
        initialDirectory={view.initialDirectory}
        onCreated={handleWorkspaceCreated}
        onCancel={() => setView({ name: 'home' })}
      />
    );
  }

  const workspace = activeWorkspaceId
    ? workspaces.find((w) => w.id === activeWorkspaceId)
    : undefined;
  const openedWorkspaces = openedWorkspaceIds
    .map((id) => workspaces.find((w) => w.id === id))
    .filter((w): w is StoredWorkspace => Boolean(w));

  if (!workspace) {
    return <div className="p-5 text-[var(--text-muted)]">{t('loadingWorkspace')}</div>;
  }

  return (
    <PreferencesProvider
      preferences={preferences}
      updatePreferences={handlePreferencesChange}
    >
      <WorkspaceProvider
        workspace={workspace}
        openWorkspaces={openedWorkspaces}
        activeWorkspaceId={workspace.id}
        allWorkspaces={workspaces}
        openWorkspaceTab={handleOpenWorkspaceTab}
        closeWorkspaceTab={handleCloseWorkspaceTab}
      >
        <Dashboard
          serverStatus={serverStatus}
          openAgentRunChatTarget={openAgentRunChatTarget}
          launchChatRequest={pendingLaunchRequest}
          onUpdateWorkspace={handleUpdateWorkspace}
          onNewWorkspace={() => setView({ name: 'setup' })}
          onGoHome={() => {
            void window.nakiros.getWorkspaces().then((fresh) => {
              setWorkspaces(fresh);
              setOpenedWorkspaceIds((prev) => prev.filter((id) => fresh.some((w) => w.id === id)));
            });
            setView({ name: 'home' });
          }}
          onGoGettingStarted={(workspaceId) => {
            setPendingLaunchRequest(null);
            setView({ name: 'getting-started', workspaceId });
          }}
        />
      </WorkspaceProvider>
    </PreferencesProvider>
  );
}
