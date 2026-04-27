import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRun, Project, AppPreferences, BundledSkillConflict } from '@nakiros/shared';
import { DEFAULT_ACCENT_HUE, DEFAULT_DENSITY } from '@nakiros/shared';
import Home from './views/Home';
import ScanView from './views/ScanView';
import Dashboard from './views/Dashboard';
import NakirosSkillsView from './views/NakirosSkillsView';
import GlobalSkillsView from './views/GlobalSkillsView';
import PluginSkillsView from './views/PluginSkillsView';
import BundledSkillConflictsView from './views/BundledSkillConflictsView';
import NewShell from './components/shell/NewShell';
import { resolveLanguage } from './utils/language';
import i18n from './i18n/index';
import { PreferencesProvider } from './hooks/usePreferences';
import { ProjectProvider } from './hooks/useProject';
import { useAgentRunsSync } from './hooks/useAgentRunsSync';
import { AgentRunNavigationProvider } from './hooks/useAgentRunNavigation';
import { agentRunFocus } from './lib/agent-run-focus';

/**
 * Stable per-mount detection of the `?shell=new` flag introduced by
 * Phase 1 PR2b. Module-level constant so the conditional render below
 * doesn't disturb React's hook order (the flag can't change without a
 * full reload, just like `?dev=tokens`).
 */
const SHELL_NEW =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('shell') === 'new';

const FALLBACK_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
  density: DEFAULT_DENSITY,
  accentHue: DEFAULT_ACCENT_HUE,
};

type View =
  | { name: 'loading' }
  | { name: 'scan' }
  | { name: 'home' }
  | { name: 'dashboard' }
  | { name: 'nakiros-skills' }
  | { name: 'global-skills' }
  | { name: 'plugin-skills' };

/**
 * Root component of the Nakiros web UI. Boots the daemon-backed app:
 * loads preferences, surfaces bundled-skill conflicts, lists projects, and
 * routes to the matching top-level view (loading / scan / home / dashboard /
 * nakiros-skills / global-skills / plugin-skills).
 *
 * Forces the dark theme on the document root and resolves the active i18n
 * language from `AppPreferences.language` via {@link resolveLanguage}.
 * Manages the in-memory list of opened project tabs and feeds them into
 * {@link ProjectProvider} when the dashboard is active.
 */
export default function App() {
  const { t } = useTranslation('common');
  const [view, setView] = useState<View>({ name: 'loading' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [openedProjectIds, setOpenedProjectIds] = useState<string[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(FALLBACK_PREFERENCES);
  const [bundledConflicts, setBundledConflicts] = useState<BundledSkillConflict[]>([]);
  const [bundledConflictsDismissed, setBundledConflictsDismissed] = useState(false);

  // Mirror the daemon's active runs into the global agent-run store. The
  // RunsCenter pill below (and any other component) reads from there.
  useAgentRunsSync();

  async function boot() {
    try {
      const prefs = await window.nakiros.getPreferences();
      const resolvedPrefs: AppPreferences = {
        theme: 'dark',
        language: prefs.language ?? 'system',
        updatedAt: prefs.updatedAt ?? '',
        mcpServerUrl: prefs.mcpServerUrl,
        density: prefs.density ?? DEFAULT_DENSITY,
        accentHue: prefs.accentHue ?? DEFAULT_ACCENT_HUE,
      };
      setPreferences(resolvedPrefs);
      void i18n.changeLanguage(resolveLanguage(resolvedPrefs.language));

      // Surface any bundled-skill update conflicts the daemon detected at boot.
      try {
        const conflicts = await window.nakiros.listBundledSkillConflicts();
        setBundledConflicts(conflicts);
      } catch (err) {
        console.error('[App] listBundledSkillConflicts failed', err);
      }

      // Try loading projects from SQLite
      const savedProjects = await window.nakiros.listProjects();
      if (savedProjects.length > 0) {
        setProjects(savedProjects);
        setView({ name: 'home' });
      } else {
        // First launch or no projects yet — go to scan
        setView({ name: 'scan' });
      }
      setBootError(null);
    } catch (err) {
      setBootError(t('workspaceLoadError'));
      setView({ name: 'home' });
    }
  }

  useEffect(() => {
    void boot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  // Apply new-design preferences (density + accent hue) to <html>.
  // `data-density` triggers --n-row-h / --n-pad-card overrides in tokens.css;
  // accent hue rotates the four --n-accent* OKLch vars in real time.
  useEffect(() => {
    const root = document.documentElement;
    const density = preferences.density ?? DEFAULT_DENSITY;
    if (density === 'standard') delete root.dataset.density;
    else root.dataset.density = density;

    const hue = preferences.accentHue ?? DEFAULT_ACCENT_HUE;
    root.style.setProperty('--n-accent', `oklch(0.78 0.10 ${hue})`);
    root.style.setProperty('--n-accent-strong', `oklch(0.84 0.12 ${hue})`);
    root.style.setProperty('--n-accent-soft', `oklch(0.78 0.10 ${hue} / 0.14)`);
    root.style.setProperty('--n-accent-line', `oklch(0.78 0.10 ${hue} / 0.35)`);
  }, [preferences.density, preferences.accentHue]);

  // Sync opened project tabs with available projects
  useEffect(() => {
    if (view.name !== 'dashboard') return;

    const existingIds = openedProjectIds.filter((id) => projects.some((p) => p.id === id));
    if (existingIds.length !== openedProjectIds.length) {
      setOpenedProjectIds(existingIds);
      return;
    }

    if (activeProjectId && existingIds.includes(activeProjectId)) return;
    if (existingIds.length > 0) {
      setActiveProjectId(existingIds[0]!);
      return;
    }

    setActiveProjectId(null);
    setView({ name: 'home' });
  }, [view, openedProjectIds, activeProjectId, projects]);

  function openProject(project: Project) {
    setOpenedProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]));
    setActiveProjectId(project.id);
    setView({ name: 'dashboard' });
  }

  function handleOpenProjectTab(id: string) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    openProject(project);
  }

  function handleCloseProjectTab(id: string) {
    setOpenedProjectIds((prev) => {
      const next = prev.filter((pid) => pid !== id);
      setActiveProjectId((current) => {
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

  function handleScanComplete(scannedProjects: Project[]) {
    setProjects(scannedProjects);
    setView({ name: 'home' });
  }

  async function handleRescan() {
    // Inline rescan: keep the user on the new-shell home, refresh the project
    // list silently. The banner stays visible until both phases finish:
    //  1. Disk scan (fast — fires `project:scanProgress` events)
    //  2. Aggregate recompute for every (post-scan) project (slow — JSONL +
    //     scoring per conversation), so the cards land with fresh metrics
    //     before the banner disappears.
    const next = await window.nakiros.scanProjects();
    setProjects(next);
    await Promise.all(
      next.map((p) =>
        window.nakiros.refreshProjectAggregate(p.id).catch(() => undefined),
      ),
    );
  }

  async function handleDismissProject(id: string) {
    await window.nakiros.dismissProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setOpenedProjectIds((prev) => prev.filter((pid) => pid !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
  }

  /**
   * Re-pull the active project list from the daemon. Used by HomeScreen after
   * the user restores a previously-dismissed project so the new card lands in
   * the active grid without forcing a full rescan.
   */
  async function handleProjectsChanged() {
    const fresh = await window.nakiros.listProjects();
    setProjects(fresh);
  }

  /**
   * Route to the native screen hosting `run` and queue the focus so the
   * destination view auto-selects the right skill (and switches to its
   * audit tab) once it has loaded its skill list.
   */
  function navigateToAgentRun(run: AgentRun) {
    if (run.target.type !== 'skill') return;
    agentRunFocus.set(run);
    switch (run.target.scope) {
      case 'nakiros-bundled':
        setView({ name: 'nakiros-skills' });
        break;
      case 'claude-global':
        setView({ name: 'global-skills' });
        break;
      case 'plugin':
        setView({ name: 'plugin-skills' });
        break;
      case 'project': {
        const projectId = run.target.projectId;
        if (!projectId) break;
        const project = projects.find((p) => p.id === projectId);
        if (project) openProject(project);
        break;
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const showConflictsView =
    !bundledConflictsDismissed && bundledConflicts.length > 0 && view.name !== 'loading';
  if (showConflictsView) {
    return (
      <BundledSkillConflictsView
        conflicts={bundledConflicts}
        onClose={() => setBundledConflictsDismissed(true)}
        onResolved={(skillName) => {
          setBundledConflicts((prev) => prev.filter((c) => c.skillName !== skillName));
        }}
      />
    );
  }

  function renderView() {
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

    if (view.name === 'scan') {
      return <ScanView onComplete={handleScanComplete} />;
    }

    if (view.name === 'home') {
      return (
        <Home
          projects={projects}
          bootError={bootError ?? undefined}
          onOpenProject={(id) => {
            const project = projects.find((p) => p.id === id);
            if (project) openProject(project);
          }}
          onRescan={handleRescan}
          onDismissProject={handleDismissProject}
          onOpenNakirosSkills={() => setView({ name: 'nakiros-skills' })}
          onOpenGlobalSkills={() => setView({ name: 'global-skills' })}
          onOpenPluginSkills={() => setView({ name: 'plugin-skills' })}
        />
      );
    }

    if (view.name === 'nakiros-skills') {
      return <NakirosSkillsView onBack={() => setView({ name: 'home' })} />;
    }

    if (view.name === 'global-skills') {
      return <GlobalSkillsView onBack={() => setView({ name: 'home' })} />;
    }

    if (view.name === 'plugin-skills') {
      return <PluginSkillsView onBack={() => setView({ name: 'home' })} />;
    }

    const project = activeProjectId
      ? projects.find((p) => p.id === activeProjectId)
      : undefined;
    const openedProjects = openedProjectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => Boolean(p));

    if (!project) {
      return <div className="p-5 text-[var(--text-muted)]">{t('loadingWorkspace')}</div>;
    }

    return (
      <PreferencesProvider
        preferences={preferences}
        updatePreferences={handlePreferencesChange}
      >
        <ProjectProvider
          project={project}
          openProjects={openedProjects}
          activeProjectId={project.id}
          allProjects={projects}
          openProjectTab={handleOpenProjectTab}
          closeProjectTab={handleCloseProjectTab}
        >
          <Dashboard
            onGoHome={() => {
              void window.nakiros.listProjects().then((fresh) => {
                setProjects(fresh);
                setOpenedProjectIds((prev) => prev.filter((id) => fresh.some((p) => p.id === id)));
              });
              setView({ name: 'home' });
            }}
          />
        </ProjectProvider>
      </PreferencesProvider>
    );
  }

  // PR2b new shell takes over once boot is done and there's nothing
  // full-screen to handle (loading splash, first-run scan). The legacy
  // shell is preserved without the flag so we can A/B and roll back.
  if (SHELL_NEW && view.name !== 'loading' && view.name !== 'scan') {
    return (
      <AgentRunNavigationProvider navigate={navigateToAgentRun}>
        <NewShell
          projects={projects}
          preferences={preferences}
          updatePreferences={handlePreferencesChange}
          onRescan={handleRescan}
          onDismissProject={handleDismissProject}
          onProjectsChanged={handleProjectsChanged}
          bootError={bootError ?? undefined}
        />
      </AgentRunNavigationProvider>
    );
  }

  return (
    <AgentRunNavigationProvider navigate={navigateToAgentRun}>
      {renderView()}
    </AgentRunNavigationProvider>
  );
}
