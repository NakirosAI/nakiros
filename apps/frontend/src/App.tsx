import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, AppPreferences, BundledSkillConflict } from '@nakiros/shared';
import Home from './views/Home';
import ScanView from './views/ScanView';
import Dashboard from './views/Dashboard';
import NakirosSkillsView from './views/NakirosSkillsView';
import GlobalSkillsView from './views/GlobalSkillsView';
import BundledSkillConflictsView from './views/BundledSkillConflictsView';
import { resolveLanguage } from './utils/language';
import i18n from './i18n/index';
import { PreferencesProvider } from './hooks/usePreferences';
import { ProjectProvider } from './hooks/useProject';

const FALLBACK_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
};

type View =
  | { name: 'loading' }
  | { name: 'scan' }
  | { name: 'home' }
  | { name: 'dashboard' }
  | { name: 'nakiros-skills' }
  | { name: 'global-skills' };

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

  async function boot() {
    try {
      const prefs = await window.nakiros.getPreferences();
      const resolvedPrefs: AppPreferences = {
        theme: 'dark',
        language: prefs.language ?? 'system',
        updatedAt: prefs.updatedAt ?? '',
        mcpServerUrl: prefs.mcpServerUrl,
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
    setView({ name: 'scan' });
  }

  async function handleDismissProject(id: string) {
    await window.nakiros.dismissProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setOpenedProjectIds((prev) => prev.filter((pid) => pid !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
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
        />
      );
    }

    if (view.name === 'nakiros-skills') {
      return <NakirosSkillsView onBack={() => setView({ name: 'home' })} />;
    }

    if (view.name === 'global-skills') {
      return <GlobalSkillsView onBack={() => setView({ name: 'home' })} />;
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

  return renderView();
}
