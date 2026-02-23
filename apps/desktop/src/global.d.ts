import type {
  StoredWorkspace,
  AgentProfile,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
} from '@tiqora/shared';

declare global {
  interface Window {
    tiqora: {
      // Workspace
      selectDirectory(): Promise<string | null>;
      openFilePicker(): Promise<string | null>;
      getWorkspaces(): Promise<StoredWorkspace[]>;
      saveWorkspace(w: StoredWorkspace): Promise<void>;
      deleteWorkspace(id: string): Promise<void>;
      detectProfile(localPath: string): Promise<AgentProfile>;
      syncWorkspace(w: StoredWorkspace): Promise<void>;
      openPath(path: string): Promise<void>;
      gitRemoteUrl(repoPath: string): Promise<string | null>;
      gitClone(url: string, parentDir: string): Promise<{ success: boolean; repoPath: string; repoName: string; error?: string }>;
      getPreferences(): Promise<AppPreferences>;
      savePreferences(prefs: AppPreferences): Promise<void>;
      getAgentInstallStatus(repoPath: string): Promise<AgentInstallStatus>;
      installAgents(request: AgentInstallRequest): Promise<AgentInstallSummary>;

      // Tickets
      getTickets(wsId: string): Promise<LocalTicket[]>;
      saveTicket(wsId: string, t: LocalTicket): Promise<void>;
      removeTicket(wsId: string, id: string): Promise<void>;

      // Epics
      getEpics(wsId: string): Promise<LocalEpic[]>;
      saveEpic(wsId: string, e: LocalEpic): Promise<void>;
      removeEpic(wsId: string, id: string): Promise<void>;

      // Agent context + clipboard
      generateContext(wsId: string, ticketId: string, ws: StoredWorkspace): Promise<string>;
      writeClipboard(text: string): Promise<void>;
    };
  }
}
