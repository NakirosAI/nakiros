import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRun, AppPreferences, Project } from '@nakiros/shared';
import { useTabs, type ProjectTabView, type Tab } from '../../hooks/useTabs';
import { PreferencesProvider } from '../../hooks/usePreferences';
import { ProjectProvider } from '../../hooks/useProject';
import HomeScreen from '../../views/HomeScreen';
import ProjectOverviewScreen from '../../views/ProjectOverviewScreen';
import SkillsScreen from '../../views/SkillsScreen';
import SkillDetailScreen from '../../views/SkillDetailScreen';
import RulesScreen from '../../views/RulesScreen';
import SubagentsScreen from '../../views/SubagentsScreen';
import OutputStylesScreen from '../../views/OutputStylesScreen';
import PermissionsScreen from '../../views/PermissionsScreen';
import McpScreen from '../../views/McpScreen';
import HooksScreen from '../../views/HooksScreen';
import ClaudeMdScreen from '../../views/ClaudeMdScreen';
import MarketplaceScreen from '../../views/MarketplaceScreen';
import RunScreen from '../../views/RunScreen';
import SettingsScreen from '../../views/SettingsScreen';
import ConversationsScreen from '../conversations/ConversationsScreen';
import type { MarketplaceTabView, SkillTabIdentity } from '../../hooks/useTabs';
import NewShellTopBar from './NewShellTopBar';
import NewShellSidebar from './NewShellSidebar';

interface NewShellProps {
  projects: Project[];
  preferences: AppPreferences;
  updatePreferences(next: AppPreferences): Promise<void>;
  onRescan(): void;
  onDismissProject(id: string): Promise<void>;
  onProjectsChanged(): Promise<void>;
  bootError?: string;
}

/**
 * Shell principal de Nakiros. Pilotée par {@link useTabs}, elle ouvre les
 * projets, runs, skills et marketplaces dans des onglets parallèles.
 */
export default function NewShell({
  projects,
  preferences,
  updatePreferences,
  onRescan,
  onDismissProject,
  onProjectsChanged,
  bootError,
}: NewShellProps) {
  const { t } = useTranslation('common');
  const { tabs, activeTabId, activeTab, openTab, closeTab, setActiveTab, updateTab } = useTabs();

  // If the project backing an open project tab disappears (rescan,
  // dismissal), close that tab to avoid rendering a stale Dashboard.
  useEffect(() => {
    const orphans = tabs.filter(
      (tab): tab is Extract<Tab, { kind: 'project' }> =>
        tab.kind === 'project' && !projects.some((p) => p.id === tab.projectId),
    );
    for (const orphan of orphans) closeTab(orphan.id);
  }, [projects, tabs, closeTab]);

  const handleOpenProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    openTab({ kind: 'project', projectId, label: project.name, view: 'overview' });
  };

  const newTab = () => {
    openTab({ kind: 'home', label: 'Home' });
  };

  const handleOpenRun = (run: AgentRun) => {
    openTab({ kind: 'run', runId: run.id, runKind: run.kind, label: run.title });
  };

  /**
   * Opens a skill detail tab for any cross-scope skill (global,
   * plugin, nakiros bundled). Project-scoped skills still go through
   * the in-project sidebar instead of a standalone tab so the
   * existing layout doesn't change.
   */
  const handleOpenSkillTab = (identity: SkillTabIdentity, label: string) => {
    openTab({ kind: 'skill', identity, label });
  };

  /**
   * Lower-level callback used by `launch*` helpers in `run-launcher.ts`.
   * Receives `{runId, runKind, label}` once the start IPC has resolved
   * and just pushes the matching `kind: 'run'` tab in front of the user.
   */
  const handleOpenRunByIds = (params: {
    runId: string;
    runKind: 'audit' | 'fix' | 'create' | 'edit' | 'eval' | 'classify-convo';
    label: string;
  }) => {
    openTab({ kind: 'run', runId: params.runId, runKind: params.runKind, label: params.label });
  };

  const handleOpenMarketplaceTab = (marketplaceName: string, label: string) => {
    openTab({ kind: 'marketplace', marketplaceName, label, view: 'overview' });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-n-canvas font-n-sans text-n-fg">
      <NewShellTopBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTab}
        onCloseTab={closeTab}
        onNewTab={newTab}
        onOpenRun={handleOpenRun}
        projects={projects}
      />
      <main className="flex flex-1 overflow-hidden">
        {activeTab.kind === 'home' && (
          <HomeScreen
            projects={projects}
            bootError={bootError}
            onOpenProject={handleOpenProject}
            onRescan={onRescan}
            onDismissProject={onDismissProject}
            onProjectsChanged={onProjectsChanged}
            onOpenSkillTab={handleOpenSkillTab}
            onOpenMarketplaceTab={handleOpenMarketplaceTab}
          />
        )}

        {activeTab.kind === 'project' && (() => {
          const tab = activeTab;
          const project = projects.find((p) => p.id === tab.projectId);
          if (!project) {
            return (
              <div className="grid flex-1 place-items-center text-n-muted">
                {t('loadingWorkspace')}
              </div>
            );
          }
          const view: ProjectTabView = tab.view ?? 'overview';
          // Always clear `skillId` when navigating to a different sub-view so
          // the skill detail doesn't survive a sidebar switch and pollute the
          // next view's render.
          const setView = (next: ProjectTabView) =>
            updateTab(tab.id, { view: next, skillId: null });
          return (
            <PreferencesProvider
              preferences={preferences}
              updatePreferences={updatePreferences}
            >
              <ProjectProvider
                project={project}
                openProjects={openProjectsFromTabs(tabs, projects)}
                activeProjectId={project.id}
                allProjects={projects}
                openProjectTab={handleOpenProject}
                closeProjectTab={(projectId) => {
                  const projectTab = tabs.find(
                    (t): t is Extract<Tab, { kind: 'project' }> =>
                      t.kind === 'project' && t.projectId === projectId,
                  );
                  if (projectTab) closeTab(projectTab.id);
                }}
              >
                <NewShellSidebar active={view} onNavigate={setView} />
                <section className="flex flex-1 flex-col overflow-hidden">
                  {view === 'overview' && (
                    <ProjectOverviewScreen key={project.id} project={project} onOpenRunTab={handleOpenRunByIds} onNavigate={setView} />
                  )}
                  {view === 'skills' && !tab.skillId && (
                    <SkillsScreen
                      key={project.id}
                      project={project}
                      onOpenSkill={(skillName) => updateTab(tab.id, { skillId: skillName })}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'skills' && tab.skillId && (
                    <SkillDetailScreen
                      key={`${project.id}/${tab.skillId}`}
                      identity={{
                        scope: 'project',
                        projectId: project.id,
                        skillName: tab.skillId,
                      }}
                      onBack={() => updateTab(tab.id, { skillId: null })}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'convs' && (
                    <ConversationsScreen key={project.id} project={project} onOpenRunTab={handleOpenRunByIds} />
                  )}
                  {view === 'rules' && (
                    <RulesScreen key={project.id} project={project} onOpenRunTab={handleOpenRunByIds} />
                  )}
                  {view === 'subagents' && (
                    <SubagentsScreen key={project.id} project={project} onOpenRunTab={handleOpenRunByIds} />
                  )}
                  {view === 'outputStyles' && (
                    <OutputStylesScreen key={project.id} project={project} onOpenRunTab={handleOpenRunByIds} />
                  )}
                  {view === 'permissions' && (
                    <PermissionsScreen
                      key={project.id}
                      project={project}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'mcp' && (
                    <McpScreen
                      key={project.id}
                      project={project}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'hooks' && (
                    <HooksScreen
                      key={project.id}
                      project={project}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'claudeMd' && (
                    <ClaudeMdScreen
                      key={project.id}
                      project={project}
                      onOpenRunTab={handleOpenRunByIds}
                    />
                  )}
                  {view === 'settings' && <SettingsScreen />}
                  {view !== 'overview' &&
                    view !== 'skills' &&
                    view !== 'convs' &&
                    view !== 'rules' &&
                    view !== 'subagents' &&
                    view !== 'outputStyles' &&
                    view !== 'permissions' &&
                    view !== 'mcp' &&
                    view !== 'hooks' &&
                    view !== 'claudeMd' &&
                    view !== 'settings' && (
                      <ComingSoon view={view} onBack={() => setView('overview')} />
                    )}
                </section>
              </ProjectProvider>
            </PreferencesProvider>
          );
        })()}

        {activeTab.kind === 'run' && (
          <RunScreen
            key={`runtab/${activeTab.id}`}
            runId={activeTab.runId}
            runKind={activeTab.runKind}
            onClose={() => closeTab(activeTab.id)}
            onOpenRunTab={handleOpenRunByIds}
          />
        )}

        {activeTab.kind === 'skill' && (
          <SkillDetailScreen
            key={`skilltab/${activeTab.id}`}
            identity={activeTab.identity}
            onOpenRunTab={handleOpenRunByIds}
          />
        )}

        {activeTab.kind === 'marketplace' && (() => {
          const tab = activeTab;
          const setView = (next: MarketplaceTabView) => updateTab(tab.id, { view: next });
          return (
            <MarketplaceScreen
              key={`marketplace/${tab.marketplaceName}`}
              marketplaceName={tab.marketplaceName}
              view={tab.view ?? 'overview'}
              onNavigate={setView}
              onOpenSkillTab={handleOpenSkillTab}
            />
          );
        })()}
      </main>
    </div>
  );
}

/**
 * Placeholder for project sub-views not yet ported (Skills / Conversations
 * / Recommendations). Kept inline because it carries no state and lives
 * exclusively inside the new shell.
 */
function ComingSoon({
  view,
  onBack,
}: {
  view: Exclude<ProjectTabView, 'overview'>;
  onBack(): void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-1 items-center justify-center bg-n-canvas">
      <div className="rounded-n-lg border border-n-border-default bg-n-surface px-8 py-7 text-center">
        <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {view}
        </div>
        <div className="mt-2 text-[15px] text-n-fg">Coming soon</div>
        <div className="mt-1 text-[12.5px] text-n-muted">
          This screen is part of a later phase of the migration.
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
        >
          ← {t('actions.back', { defaultValue: 'Back to overview' })}
        </button>
      </div>
    </div>
  );
}

/**
 * Derive the list of unique opened `Project` instances from the project
 * tabs currently in the strip. Order is preserved so consumers see them
 * in tab order. Used to feed `ProjectProvider.openProjects`, which the
 * legacy Dashboard's project-tab strip already expects.
 */
function openProjectsFromTabs(tabs: Tab[], projects: Project[]): Project[] {
  const seen = new Set<string>();
  const result: Project[] = [];
  for (const tab of tabs) {
    if (tab.kind !== 'project' || seen.has(tab.projectId)) continue;
    const project = projects.find((p) => p.id === tab.projectId);
    if (!project) continue;
    seen.add(tab.projectId);
    result.push(project);
  }
  return result;
}
