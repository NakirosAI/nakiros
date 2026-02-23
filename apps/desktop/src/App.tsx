import { useEffect, useState } from 'react';
import type { StoredWorkspace } from '@tiqora/shared';
import Home from './views/Home';
import WorkspaceSetup from './views/WorkspaceSetup';
import Dashboard from './views/Dashboard';

type View =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'dashboard'; workspaceId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' });
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([]);

  useEffect(() => {
    window.tiqora.getWorkspaces().then((ws) => {
      setWorkspaces(ws);
      setView({ name: 'home' });
    });
  }, []);

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
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setView({ name: 'dashboard', workspaceId: updated.id });
  }

  async function handleWorkspaceCreated(workspace: StoredWorkspace) {
    const updated = await window.tiqora.getWorkspaces();
    setWorkspaces(updated);
    setView({ name: 'dashboard', workspaceId: workspace.id });
  }

  function handleSwitchWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (ws) void openWorkspace(ws);
  }

  if (view.name === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Chargement…
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

  const workspace = workspaces.find((w) => w.id === view.workspaceId);
  if (!workspace) {
    return (
      <WorkspaceSetup
        onCreated={handleWorkspaceCreated}
        onCancel={() => setView({ name: 'home' })}
      />
    );
  }

  return (
    <Dashboard
      workspace={workspace}
      allWorkspaces={workspaces}
      onSwitchWorkspace={handleSwitchWorkspace}
      onNewWorkspace={() => setView({ name: 'setup' })}
      onGoHome={() => setView({ name: 'home' })}
    />
  );
}
