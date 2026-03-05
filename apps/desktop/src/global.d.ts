import type {
  StoredWorkspace,
  AgentProfile,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentProvider,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
  StoredConversation,
  StoredAgentTabsState,
} from '@nakiros/shared';

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

interface SessionFeedbackData {
  session_id: string;
  workspace_id: string;
  rating: 1 | -1;
  comment?: string;
  agent: string;
  workflow?: string;
  editor: string;
  duration_seconds?: number;
  message_count?: number;
  conversation_shared?: boolean;
  conversation?: unknown;
}

interface ProductFeedbackData {
  category: 'bug' | 'suggestion' | 'agent' | 'workflow' | 'ux';
  message: string;
}

declare global {
  interface DetectedEditor {
    id: 'claude' | 'cursor' | 'codex';
    label: string;
    detected: boolean;
    targetDir: string;
  }

  interface OnboardingProgressEvent {
    label: string;
    done: boolean;
    error?: string;
  }

  interface OnboardingInstallResult {
    success: boolean;
    errors: string[];
  }

  interface UpdateManifestFile {
    type: 'agent' | 'workflow' | 'command' | 'core';
    name: string;
    filename: string;
    path: string;         // e.g. "agents/dev.md"
    hash: string;         // "sha256:..."
    downloadUrl: string;  // computed in checkForUpdates
  }

  interface UpdateCheckResult {
    hasUpdate: boolean;
    compatible: boolean;
    networkError?: boolean;
    incompatibleReason?: string;   // "min_app_version" | "required_features"
    incompatibleMessage?: string;
    latestVersion: string;
    changelog: string;
    channel: string;
    changedFiles: UpdateManifestFile[];
  }

  interface BundleVersionInfo {
    bundle_version: string;
    channel: string;
    app_version: string;
    last_check: string;
    installed_at: string;
    files: Record<string, string>; // path → "sha256:..."
  }

  interface ScannedDoc {
    name: string;
    relativePath: string;
    absolutePath: string;
    isGenerated: boolean;
    lastModifiedAt?: number;
  }

  interface ScannedRepo {
    repoName: string;
    repoPath: string;
    docs: ScannedDoc[];
  }

  interface GlobalSection {
    docs: ScannedDoc[];
    missingNames: string[];
  }

  interface ScanResult {
    repos: ScannedRepo[];
    globalSection: GlobalSection;
    primaryRepoPath: string;
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
    nakiros: {
      // Workspace
      selectDirectory(): Promise<string | null>;
      openFilePicker(): Promise<string | null>;
      getWorkspaces(): Promise<StoredWorkspace[]>;
      saveWorkspace(w: StoredWorkspace): Promise<void>;
      deleteWorkspace(id: string): Promise<void>;
      createWorkspaceRoot(parentDir: string, workspaceName: string): Promise<string>;
      detectProfile(localPath: string): Promise<AgentProfile>;
      copyLocalRepo(sourcePath: string, targetParentDir: string): Promise<{ repoPath: string; repoName: string }>;
      syncWorkspace(w: StoredWorkspace): Promise<void>;
      syncWorkspaceYaml(workspace: StoredWorkspace): Promise<string>;
      resetWorkspace(workspace: StoredWorkspace): Promise<{ deletedPaths: string[]; errors: Array<{ path: string; error: string }> }>;
      openPath(path: string): Promise<void>;
      gitRemoteUrl(repoPath: string): Promise<string | null>;
      gitClone(url: string, parentDir: string): Promise<{ success: boolean; repoPath: string; repoName: string; error?: string }>;
      gitInit(repoPath: string): Promise<{ success: boolean; error?: string }>;
      getPreferences(): Promise<AppPreferences>;
      savePreferences(prefs: AppPreferences): Promise<void>;
      getAgentInstallStatus(repoPath: string): Promise<AgentInstallStatus>;
      installAgents(request: AgentInstallRequest): Promise<AgentInstallSummary>;
      getAgentCliStatus(): Promise<Array<{
        provider: 'claude' | 'codex' | 'cursor';
        label: string;
        command: string;
        installed: boolean;
        path?: string;
        version?: string;
        error?: string;
      }>>;
      getGlobalInstallStatus(): Promise<{
        environments: Array<{
          id: 'claude' | 'codex' | 'cursor';
          label: string;
          targetDir: string;
          installed: number;
          total: number;
        }>;
        totalInstalled: number;
        totalExpected: number;
      }>;
      installAgentsGlobal(): Promise<{
        environments: Array<{
          id: 'claude' | 'codex' | 'cursor';
          label: string;
          targetDir: string;
          commandFilesCopied: number;
          commandFilesOverwritten: number;
        }>;
        commandFilesCopied: number;
        commandFilesOverwritten: number;
      }>;

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
      agentRun(
        repoPath: string,
        message: string,
        sessionId?: string | null,
        additionalDirs?: string[],
        provider?: AgentProvider,
      ): Promise<string>;
      agentCancel(runId: string): Promise<void>;
      onAgentStart(cb: (event: { runId: string; command: string; cwd: string }) => void): () => void;
      onAgentEvent(cb: (payload: { runId: string; event: AgentStreamEvent }) => void): () => void;
      onAgentDone(cb: (event: { runId: string; exitCode: number; error?: string; rawLines?: unknown[] }) => void): () => void;

      // Terminal
      terminalCreate(repoPath: string): Promise<string>;
      terminalWrite(terminalId: string, data: string): Promise<void>;
      terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
      terminalDestroy(terminalId: string): Promise<void>;
      onTerminalData(cb: (event: { terminalId: string; data: string }) => void): () => void;
      onTerminalExit(cb: (event: { terminalId: string; code: number }) => void): () => void;

      // Conversations
      getConversations(workspaceId: string): Promise<StoredConversation[]>;
      saveConversation(conv: StoredConversation): Promise<void>;
      deleteConversation(id: string, workspaceId: string): Promise<void>;
      getAgentTabs(workspaceId: string): Promise<StoredAgentTabsState | null>;
      saveAgentTabs(workspaceId: string, state: StoredAgentTabsState): Promise<void>;
      clearAgentTabs(workspaceId: string): Promise<void>;

      // Jira OAuth
      jiraStartAuth(wsId: string): Promise<void>;
      jiraDisconnect(wsId: string): Promise<StoredWorkspace | null>;
      jiraGetStatus(wsId: string): Promise<JiraStatus>;
      jiraSyncTickets(wsId: string, workspace: StoredWorkspace): Promise<JiraSyncResult>;
      onJiraAuthComplete(cb: (data: JiraAuthCompletePayload) => void): () => void;
      onJiraAuthError(cb: (data: JiraAuthErrorPayload) => void): () => void;
      jiraGetProjects(wsId: string): Promise<JiraProject[]>;
      jiraGetBoardType(wsId: string, projectKey: string): Promise<{ boardType: 'scrum' | 'kanban' | 'unknown'; boardId: string | null }>;
      jiraCountTickets(wsId: string, projectKey: string, syncFilter: string, boardType: string): Promise<{ count: number; hasMore: boolean }>;

      // Docs
      scanDocs(workspace: StoredWorkspace): Promise<ScanResult>;
      readDoc(absolutePath: string): Promise<string>;

      // MCP Server
      getServerStatus(): Promise<'starting' | 'running' | 'stopped'>;
      restartServer(): Promise<void>;
      onServerStatusChange(cb: (status: 'starting' | 'running' | 'stopped') => void): () => void;

      // Onboarding
      nakirosConfigExists(): Promise<boolean>;
      onboardingDetectEditors(): Promise<DetectedEditor[]>;
      onboardingInstall(editors: DetectedEditor[]): Promise<OnboardingInstallResult>;
      onOnboardingProgress(cb: (event: OnboardingProgressEvent) => void): () => void;

      // Updates
      checkForUpdates(force?: boolean, channel?: string): Promise<UpdateCheckResult>;
      applyUpdate(files: UpdateManifestFile[], bundleVersion: string): Promise<void>;
      getVersionInfo(): Promise<BundleVersionInfo | null>;
      onUpdatesAvailable(cb: (result: UpdateCheckResult) => void): () => void;
      onUpdatesProgress(cb: (event: { file: string; done: boolean; error?: string }) => void): () => void;

      // Feedback
      sendSessionFeedback(data: SessionFeedbackData): Promise<void>;
      sendProductFeedback(data: ProductFeedbackData): Promise<void>;
    };
  }
}
