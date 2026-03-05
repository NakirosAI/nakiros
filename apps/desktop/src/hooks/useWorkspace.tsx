import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { StoredWorkspace } from '@nakiros/shared';

interface WorkspaceContextValue {
  workspace: StoredWorkspace;
  openWorkspaces: StoredWorkspace[];
  activeWorkspaceId: string;
  allWorkspaces: StoredWorkspace[];
  openWorkspaceTab(id: string): void;
  closeWorkspaceTab(id: string): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps extends WorkspaceContextValue {
  children: ReactNode;
}

export function WorkspaceProvider({
  workspace,
  openWorkspaces,
  activeWorkspaceId,
  allWorkspaces,
  openWorkspaceTab,
  closeWorkspaceTab,
  children,
}: WorkspaceProviderProps) {
  const value = useMemo(
    () => ({
      workspace,
      openWorkspaces,
      activeWorkspaceId,
      allWorkspaces,
      openWorkspaceTab,
      closeWorkspaceTab,
    }),
    [workspace, openWorkspaces, activeWorkspaceId, allWorkspaces, openWorkspaceTab, closeWorkspaceTab],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return context;
}
