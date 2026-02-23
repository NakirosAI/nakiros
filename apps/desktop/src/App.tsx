import { useEffect, useState } from 'react';
import type {
  StoredWorkspace,
  AppPreferences,
  ResolvedTheme,
} from '@tiqora/shared';
import Home from './views/Home';
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
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'dashboard' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' });
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([]);
  const [openedWorkspaceIds, setOpenedWorkspaceIds] = useState<string[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(FALLBACK_PREFERENCES);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    void (async () => {
      try {
        const [ws, prefs] = await Promise.all([
          window.tiqora.getWorkspaces(),
          window.tiqora.getPreferences(),
        ]);
        setWorkspaces(ws);
        setPreferences({
          theme: prefs.theme ?? 'system',
          language: prefs.language ?? 'system',
          updatedAt: prefs.updatedAt ?? '',
        });
      } catch {
        setBootError(MESSAGES[resolveLanguage('system')].workspaceLoadError);
      } finally {
        setView({ name: 'home' });
      }
    })();
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

  async function handleOpenDirectory() {
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;

    // Chercher un workspace stocké qui contient ce dossier
    const match = workspaces.find((ws) =>
      ws.repos.some((r) => r.localPath === dir),
    );

    if (match) {
      await openWorkspace(match);
    } else {
      // Aucun match → lancer le wizard avec ce dossier pré-sélectionné
      setView({ name: 'setup' });
    }
  }

  async function openWorkspace(ws: StoredWorkspace) {
    const updated: StoredWorkspace = { ...ws, lastOpenedAt: new Date().toISOString() };
    await window.tiqora.saveWorkspace(updated);
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
    const updated = await window.tiqora.getWorkspaces();
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
    await window.tiqora.savePreferences(withTimestamp);
    setPreferences(withTimestamp);
  }

  async function handleUpdateWorkspace(updated: StoredWorkspace) {
    await window.tiqora.saveWorkspace(updated);
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    if (updated.repos.length > 0) {
      void window.tiqora.syncWorkspace(updated);
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

  if (view.name === 'home') {
    const sorted = [...workspaces].sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
    );
    return (
      <Home
        recentWorkspaces={sorted}
        bootError={bootError ?? undefined}
        language={language}
        onOpenDirectory={handleOpenDirectory}
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
        onPreferencesChange={handlePreferencesChange}
        onUpdateWorkspace={handleUpdateWorkspace}
        onOpenWorkspaceTab={handleOpenWorkspaceTab}
        onCloseWorkspaceTab={handleCloseWorkspaceTab}
        onNewWorkspace={() => setView({ name: 'setup' })}
        onGoHome={() => setView({ name: 'home' })}
      />
  );
}
