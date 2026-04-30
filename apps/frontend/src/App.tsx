import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, AppPreferences, BundledSkillConflict } from '@nakiros/shared';
import { DEFAULT_ACCENT_HUE, DEFAULT_DENSITY } from '@nakiros/shared';
import ScanView from './views/ScanView';
import BundledSkillConflictsView from './views/BundledSkillConflictsView';
import NewShell from './components/shell/NewShell';
import { resolveLanguage } from './utils/language';
import i18n from './i18n/index';
import { useAgentRunsSync } from './hooks/useAgentRunsSync';

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
  | { name: 'shell' };

/**
 * Root component of the Nakiros web UI. Boots the daemon-backed app
 * (preferences, bundled-skill conflicts, project list) and hands control
 * to {@link NewShell} once boot is done. Forces dark theme on the document
 * root and resolves the active i18n language from `AppPreferences.language`
 * via {@link resolveLanguage}.
 */
export default function App() {
  const { t } = useTranslation('common');
  const [view, setView] = useState<View>({ name: 'loading' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(FALLBACK_PREFERENCES);
  const [bundledConflicts, setBundledConflicts] = useState<BundledSkillConflict[]>([]);
  const [bundledConflictsDismissed, setBundledConflictsDismissed] = useState(false);

  // Mirror the daemon's active runs into the global agent-run store.
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

      try {
        const conflicts = await window.nakiros.listBundledSkillConflicts();
        setBundledConflicts(conflicts);
      } catch (err) {
        console.error('[App] listBundledSkillConflicts failed', err);
      }

      const savedProjects = await window.nakiros.listProjects();
      if (savedProjects.length > 0) {
        setProjects(savedProjects);
        setView({ name: 'shell' });
      } else {
        setView({ name: 'scan' });
      }
      setBootError(null);
    } catch (err) {
      setBootError(t('workspaceLoadError'));
      setView({ name: 'shell' });
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

  async function handlePreferencesChange(next: AppPreferences) {
    const withTimestamp: AppPreferences = { ...next, updatedAt: new Date().toISOString() };
    await window.nakiros.savePreferences(withTimestamp);
    setPreferences(withTimestamp);
    void i18n.changeLanguage(resolveLanguage(withTimestamp.language));
  }

  function handleScanComplete(scannedProjects: Project[]) {
    setProjects(scannedProjects);
    setView({ name: 'shell' });
  }

  async function handleRescan() {
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
  }

  /**
   * Re-pull the active project list from the daemon. Used by HomeScreen
   * after the user restores a previously-dismissed project so the new
   * card lands in the active grid without forcing a full rescan.
   */
  async function handleProjectsChanged() {
    const fresh = await window.nakiros.listProjects();
    setProjects(fresh);
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

  return (
    <NewShell
      projects={projects}
      preferences={preferences}
      updatePreferences={handlePreferencesChange}
      onRescan={handleRescan}
      onDismissProject={handleDismissProject}
      onProjectsChanged={handleProjectsChanged}
      bootError={bootError ?? undefined}
    />
  );
}
