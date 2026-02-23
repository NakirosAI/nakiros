import type { StoredWorkspace, AgentProfile } from '@tiqora/shared';

declare global {
  interface Window {
    tiqora: {
      selectDirectory(): Promise<string | null>;
      getWorkspaces(): Promise<StoredWorkspace[]>;
      saveWorkspace(w: StoredWorkspace): Promise<void>;
      deleteWorkspace(id: string): Promise<void>;
      detectProfile(localPath: string): Promise<AgentProfile>;
      syncWorkspace(w: StoredWorkspace): Promise<void>;
      openPath(path: string): Promise<void>;
    };
  }
}
