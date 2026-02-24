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

interface JiraStatus {
  connected: boolean;
  cloudUrl?: string;
  displayName?: string;
}

interface JiraSyncResult {
  imported: number;
  updated: number;
  epicsImported: number;
  error?: string;
}

interface JiraAuthCompletePayload {
  wsId: string;
  cloudUrl: string;
  displayName: string;
  workspace?: StoredWorkspace;
}

interface JiraAuthErrorPayload {
  wsId: string;
  error: string;
}

declare global {
  interface StoredMessage {
    role: 'user' | 'agent';
    content: string;
    tools: Array<{ name: string; display: string }>;
  }

  interface StoredConversation {
    id: string;
    sessionId: string;
    repoPath: string;
    repoName: string;
    title: string;
    createdAt: string;
    lastUsedAt: string;
    messages: StoredMessage[];
  }

  type AgentStreamEvent =
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string; display: string }
    | { type: 'session'; id: string };

  interface JiraProject {
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
  }

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

      // Agent runner
      agentRun(repoPath: string, message: string, sessionId?: string | null): Promise<string>;
      agentCancel(runId: string): Promise<void>;
      onAgentStart(cb: (event: { runId: string; command: string; cwd: string }) => void): () => void;
      onAgentEvent(cb: (payload: { runId: string; event: AgentStreamEvent }) => void): () => void;
      onAgentDone(cb: (event: { runId: string; exitCode: number; error?: string }) => void): () => void;

      // Terminal
      terminalCreate(repoPath: string): Promise<string>;
      terminalWrite(terminalId: string, data: string): Promise<void>;
      terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
      terminalDestroy(terminalId: string): Promise<void>;
      onTerminalData(cb: (event: { terminalId: string; data: string }) => void): () => void;
      onTerminalExit(cb: (event: { terminalId: string; code: number }) => void): () => void;

      // Conversations
      getConversations(): Promise<StoredConversation[]>;
      saveConversation(conv: StoredConversation): Promise<void>;
      deleteConversation(id: string): Promise<void>;
      readConversationMessages(sessionId: string, repoPath: string): Promise<StoredMessage[]>;

      // Jira OAuth
      jiraStartAuth(wsId: string): Promise<void>;
      jiraDisconnect(wsId: string): Promise<StoredWorkspace | null>;
      jiraGetStatus(wsId: string): Promise<JiraStatus>;
      jiraSyncTickets(wsId: string, workspace: StoredWorkspace): Promise<JiraSyncResult>;
      onJiraAuthComplete(cb: (data: JiraAuthCompletePayload) => void): () => void;
      onJiraAuthError(cb: (data: JiraAuthErrorPayload) => void): () => void;
      jiraGetProjects(wsId: string): Promise<JiraProject[]>;

      // MCP Server
      getServerStatus(): Promise<'starting' | 'running' | 'stopped'>;
      restartServer(): Promise<void>;
      onServerStatusChange(cb: (status: 'starting' | 'running' | 'stopped') => void): () => void;
    };
  }
}
