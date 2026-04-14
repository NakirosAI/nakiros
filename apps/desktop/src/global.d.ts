import type {
  StoredWorkspace,
  AgentProfile,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentRunRequest,
  AgentProvider,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
  ResolvedLanguage,
  StoredConversation,
  StoredAgentTabsState,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraBoardSelection,
  JiraProject,
  JiraStatus,
  JiraSyncResult,
  JiraTicketCount,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  FileChangesReviewSession,
  SnapshotMeta,
} from '@nakiros/shared';

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

  interface InstalledCommand {
    id: string;
    command: string;
    kind: 'agent' | 'workflow';
    fileName: string;
  }

  interface ScannedDoc {
    name: string;
    relativePath: string;
    absolutePath: string;
    isGenerated: boolean;
    isRemote?: boolean;
    lastModifiedAt?: number;
    charCount?: number;
  }

  interface ScannedRepo {
    repoName: string;
    repoPath: string;
    docs: ScannedDoc[];
  }

  interface GlobalSection {
    docs: ScannedDoc[];
    decisionDocs: ScannedDoc[];
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

  interface AgentRunNotificationPayload {
    workspaceId: string;
    workspaceName?: string;
    conversationId?: string | null;
    tabId?: string | null;
    conversationTitle?: string;
    provider?: AgentProvider;
    durationSeconds: number;
  }

  interface OpenAgentRunChatPayload {
    workspaceId: string;
    conversationId?: string | null;
    tabId?: string | null;
    eventId?: string;
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
      getWorkspaceGettingStartedContext(workspace: StoredWorkspace): Promise<WorkspaceGettingStartedContext>;
      saveWorkspaceGettingStartedState(workspaceName: string, state: WorkspaceGettingStartedState): Promise<void>;
      openPath(path: string): Promise<void>;
      gitRemoteUrl(repoPath: string): Promise<string | null>;
      gitClone(url: string, parentDir: string): Promise<{ success: boolean; repoPath: string; repoName: string; error?: string }>;
      gitInit(repoPath: string): Promise<{ success: boolean; error?: string }>;
      getPreferences(): Promise<AppPreferences>;
      getSystemLanguage(): Promise<ResolvedLanguage>;
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
      getInstalledCommands(): Promise<InstalledCommand[]>;
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
      agentRun(request: AgentRunRequest): Promise<string>;
      agentCancel(runId: string): Promise<void>;
      onAgentStart(cb: (event: { runId: string; command: string; cwd: string; conversationId?: string; agentId?: string }) => void): () => void;
      onAgentEvent(cb: (payload: { runId: string; event: AgentStreamEvent }) => void): () => void;
      onAgentDone(cb: (event: { runId: string; exitCode: number; error?: string; rawLines?: unknown[] }) => void): () => void;
      showAgentRunNotification(payload: AgentRunNotificationPayload): Promise<void>;
      onOpenAgentRunChat(cb: (payload: OpenAgentRunChatPayload) => void): () => void;

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
      jiraStartAuth(wsId: string, jiraUrl?: string): Promise<void>;
      jiraDisconnect(wsId: string): Promise<StoredWorkspace | null>;
      jiraGetStatus(wsId: string): Promise<JiraStatus>;
      jiraSyncTickets(wsId: string, workspace: StoredWorkspace): Promise<JiraSyncResult>;
      onJiraAuthComplete(cb: (data: JiraAuthCompletePayload) => void): () => void;
      onJiraAuthError(cb: (data: JiraAuthErrorPayload) => void): () => void;
      jiraGetProjects(wsId: string): Promise<JiraProject[]>;
      jiraGetBoardType(wsId: string, projectKey: string): Promise<JiraBoardSelection>;
      jiraCountTickets(wsId: string, projectKey: string, syncFilter: string, boardType: string): Promise<JiraTicketCount>;

      // Docs
      scanDocs(workspace: StoredWorkspace): Promise<ScanResult>;
      readDoc(absolutePath: string): Promise<string>;
      writeDoc(absolutePath: string, content: string): Promise<void>;
      watchDoc(absolutePath: string): Promise<void>;
      unwatchDoc(absolutePath: string): Promise<void>;
      onDocChanged(cb: (absolutePath: string) => void): () => void;

      // Artifacts (local only)
      artifactListContextFiles(workspace: StoredWorkspace): Promise<string[]>;
      artifactReadFile(workspace: StoredWorkspace, artifactPath: string): Promise<string | null>;
      artifactGetFilePath(workspace: StoredWorkspace, artifactPath: string): Promise<string>;
      artifactGetContextTotalBytes(workspace: StoredWorkspace): Promise<number>;
      artifactListContextFilesWithSizes(workspace: StoredWorkspace): Promise<{ path: string; sizeBytes: number }[]>;

      // Snapshots
      snapshotTake(workspaceSlug: string, runId: string): Promise<void>;
      snapshotDiff(workspaceSlug: string, runId: string): Promise<FileChangesReviewSession | null>;
      snapshotRevert(workspaceSlug: string, runId: string, relativePaths?: string[]): Promise<void>;
      snapshotResolve(workspaceSlug: string, runId: string): Promise<void>;
      snapshotListPending(workspaceSlug: string): Promise<SnapshotMeta[]>;

      // Preview
      previewCheck(workspaceSlug: string): Promise<{ exists: boolean; previewRoot: string; files: string[]; conversationId: string | null }>;
      previewApply(previewRoot: string, workspaceSlug: string): Promise<void>;
      previewApplyFile(previewRoot: string, filePath: string, workspaceSlug: string): Promise<void>;
      previewDiscard(previewRoot: string): Promise<void>;

      // MCP Server
      getServerStatus(): Promise<'starting' | 'running' | 'stopped'>;
      restartServer(): Promise<void>;
      onServerStatusChange(cb: (status: 'starting' | 'running' | 'stopped') => void): () => void;

      // Onboarding
      nakirosConfigExists(): Promise<boolean>;
      onboardingDetectEditors(): Promise<DetectedEditor[]>;
      onboardingInstall(editors: DetectedEditor[]): Promise<OnboardingInstallResult>;
      onOnboardingProgress(cb: (event: OnboardingProgressEvent) => void): () => void;
    };
  }
}
