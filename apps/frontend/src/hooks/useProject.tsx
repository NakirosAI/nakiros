import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Project } from '@nakiros/shared';

interface ProjectContextValue {
  project: Project;
  openProjects: Project[];
  activeProjectId: string;
  allProjects: Project[];
  openProjectTab(id: string): void;
  closeProjectTab(id: string): void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps extends ProjectContextValue {
  children: ReactNode;
}

/**
 * Context provider for the active project + open-project tab state.
 * The shell wires real handlers (open/close tab, switch active project); inner
 * views consume the context via `useProject` instead of prop drilling.
 */
export function ProjectProvider({
  project,
  openProjects,
  activeProjectId,
  allProjects,
  openProjectTab,
  closeProjectTab,
  children,
}: ProjectProviderProps) {
  const value = useMemo(
    () => ({
      project,
      openProjects,
      activeProjectId,
      allProjects,
      openProjectTab,
      closeProjectTab,
    }),
    [project, openProjects, activeProjectId, allProjects, openProjectTab, closeProjectTab],
  );
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * Reads the project context. Throws if invoked outside `ProjectProvider`.
 */
export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used inside ProjectProvider');
  }
  return context;
}
