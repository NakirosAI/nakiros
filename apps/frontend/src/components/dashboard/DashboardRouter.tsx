import type { Project } from '@nakiros/shared';
import type { SidebarTab } from '../Sidebar';
import ProjectOverview from '../../views/ProjectOverview';
import ConversationsView from '../../views/ConversationsView';
import SkillsView from '../../views/SkillsView';
import RecommendationsView from '../../views/RecommendationsView';

interface DashboardRouterProps {
  /** Active sidebar tab — selects which view component to render. */
  activeTab: SidebarTab;
  /** Currently selected project, forwarded to every view that needs it. */
  project: Project;
}

/**
 * Pure switch from a `SidebarTab` to the matching dashboard view. Keeps the
 * shell free of view-specific imports so it can stay focused on layout +
 * project lifecycle. The `settings` tab is a placeholder until per-project
 * settings ship.
 */
export function DashboardRouter({ activeTab, project }: DashboardRouterProps) {
  // The `key={project.id}` on each view forces a remount on project switch
  // so internal state (selected skill, loaded skill list, in-flight overlays)
  // resets to the new project's data — otherwise SkillsView's
  // useSkillsViewState would keep showing the previous project's skills.
  switch (activeTab) {
    case 'dashboard':
      return <ProjectOverview key={project.id} project={project} />;
    case 'skills':
      return <SkillsView key={project.id} project={project} />;
    case 'conversations':
      return <ConversationsView key={project.id} project={project} />;
    case 'recommendations':
      return <RecommendationsView key={project.id} project={project} />;
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
