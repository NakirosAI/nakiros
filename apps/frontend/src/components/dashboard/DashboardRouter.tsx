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
