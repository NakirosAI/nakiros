import { useEffect, useState } from 'react';
import type {
  StoredWorkspace,
  AppPreferences,
  ResolvedTheme,
} from '@nakiros/shared';
import Home from './views/Home';
import Onboarding from './views/Onboarding';
import WorkspaceSetup from './views/WorkspaceSetup';
import Dashboard from './views/Dashboard';
import { MESSAGES, resolveLanguage } from './i18n';

const FALLBACK_PREFERENCES: AppPreferences = {
  theme: 'system',
  language: 'system',
  updatedAt: '',
};

type View =
  | { name: 'loading' }
  | { name: 'onboarding' }
  | { name: 'home' }
  | { name: 'setup'; initialDirectory?: string }
  | { name: 'dashboard' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' });
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([]);
  const [openedWorkspaceIds, setOpenedWorkspaceIds] = useState<string[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(FALLBACK_PREFERENCES);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [serverStatus, setServerStatus] = useState<'starting' | 'running' | 'stopped'>('starting');

  useEffect(() => {
    void (async () => {
      try {
        const [ws, prefs, status, configExists] = await Promise.all([
          window.nakiros.getWorkspaces(),
          window.nakiros.getPreferences(),
          window.nakiros.getServerStatus(),
          window.nakiros.nakirosConfigExists(),
        ]);
        setWorkspaces(ws);
        setPreferences({
          theme: prefs.theme ?? 'system',
          language: prefs.language ?? 'system',
          updatedAt: prefs.updatedAt ?? '',
        });
        setServerStatus(status);
        if (!configExists) {
          setView({ name: 'onboarding' });
          return;
        }
      } catch {
        setBootError(MESSAGES[resolveLanguage('system')].workspaceLoadError);
      } finally {
        setView((current) => current.name === 'loading' ? { name: 'home' } : current);
      }
    })();
  }, []);

  useEffect(() => {
    return window.nakiros.onServerStatusChange(setServerStatus);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const nextTheme: ResolvedTheme =
        preferences.theme === 'system'
          ? (media.matches ? 'dark' : 'light')
          : preferences.theme;
      setResolvedTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [preferences.theme]);

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
    await window.nakiros.saveWorkspace(updated);
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
    setView({ name: 'dashboard' });
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
  }

  async function handleUpdateWorkspace(updated: StoredWorkspace) {
    await window.nakiros.saveWorkspace(updated);
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    if (updated.repos.length > 0) {
      void window.nakiros.syncWorkspace(updated);
    }
  }

  const language = resolveLanguage(preferences.language);
  const msg = MESSAGES[language];

  if (view.name === 'loading') {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          color: 'var(--text-muted)',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 10, background: 'var(--primary)' }} />
          {msg.loadingWorkspace}
        </div>
      </div>
    );
  }

  if (view.name === 'onboarding') {
    return (
      <Onboarding
        language={language}
        onDone={() => setView({ name: 'setup' })}
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
        language={language}
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
    return <div style={{ padding: 20, color: 'var(--text-muted)' }}>{msg.loadingWorkspace}</div>;
  }

  return (
      <Dashboard
        workspace={workspace}
        openWorkspaces={openedWorkspaces}
        activeWorkspaceId={workspace.id}
        allWorkspaces={workspaces}
        language={language}
        preferences={preferences}
        resolvedTheme={resolvedTheme}
        serverStatus={serverStatus}
        onPreferencesChange={handlePreferencesChange}
        onUpdateWorkspace={handleUpdateWorkspace}
        onOpenWorkspaceTab={handleOpenWorkspaceTab}
        onCloseWorkspaceTab={handleCloseWorkspaceTab}
        onNewWorkspace={() => setView({ name: 'setup' })}
        onGoHome={() => {
          void window.nakiros.getWorkspaces().then((fresh) => {
            setWorkspaces(fresh);
            setOpenedWorkspaceIds((prev) => prev.filter((id) => fresh.some((w) => w.id === id)));
          });
          setView({ name: 'home' });
        }}
        onRestartServer={() => { void window.nakiros.restartServer(); }}
      />
  );
}
