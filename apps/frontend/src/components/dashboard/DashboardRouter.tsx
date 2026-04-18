import type { Project } from '@nakiros/shared';
import GlobalSettings, { type GlobalSettingsSection } from '../GlobalSettings';
import type { SidebarTab } from '../Sidebar';
import ProjectOverview from '../../views/ProjectOverview';
import ConversationsView from '../../views/ConversationsView';
import SkillsView from '../../views/SkillsView';
import RecommendationsView from '../../views/RecommendationsView';

interface DashboardRouterProps {
  showGlobalSettings: boolean;
  globalSettingsSection: GlobalSettingsSection;
  activeTab: SidebarTab;
  project: Project;
  onCloseGlobalSettings(): void;
  onGlobalUpdateApplied(): void;
}

export function DashboardRouter({
  showGlobalSettings,
  globalSettingsSection,
  activeTab,
  project,
  onCloseGlobalSettings,
  onGlobalUpdateApplied,
}: DashboardRouterProps) {
  if (showGlobalSettings) {
    return (
      <GlobalSettings
        onClose={onCloseGlobalSettings}
        initialSection={globalSettingsSection}
        onUpdateApplied={onGlobalUpdateApplied}
      />
    );
  }

  switch (activeTab) {
    case 'dashboard':
      return <ProjectOverview project={project} />;
    case 'skills':
      return <SkillsView project={project} />;
    case 'conversations':
      return <ConversationsView project={project} />;
    case 'recommendations':
      return <RecommendationsView project={project} />;
    case 'settings':
      return (
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-[var(--text-muted)]">Project settings — coming soon</p>
        </div>
      );
    default:
      return null;
  }
}
