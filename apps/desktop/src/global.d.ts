import type {
  AuthCompletePayload,
  AuthErrorPayload,
  AuthSignedOutPayload,
  AuthState,
  NakirosActionBlock,
  OrgRole,
  OrganizationInfo,
  OrganizationInvitationAcceptanceResult,
  OrganizationInvitationResult,
  OrganizationMemberListItem,
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
  BindWorkspaceProviderCredentialInput,
  CreateProviderCredentialInput,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraBoardSelection,
  JiraProject,
  JiraStatus,
  JiraSyncResult,
  JiraTicketCount,
  ProviderCredentialDeleteImpact,
  ProviderCredentialSummary,
  SetWorkspaceProviderDefaultInput,
  UpdateProviderCredentialInput,
  UpsertWorkspaceMembershipInput,
  WorkspaceMembershipListPayload,
  WorkspaceProviderCredentialsPayload,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  BacklogEpic as SharedBacklogEpic,
  BacklogSprint as SharedBacklogSprint,
  BacklogStory as SharedBacklogStory,
  BacklogTask as SharedBacklogTask,
  CreateEpicPayload as SharedCreateEpicPayload,
  CreateSprintPayload as SharedCreateSprintPayload,
  CreateStoryPayload as SharedCreateStoryPayload,
  CreateTaskPayload as SharedCreateTaskPayload,
  UpdateEpicPayload as SharedUpdateEpicPayload,
  UpdateSprintPayload as SharedUpdateSprintPayload,
  UpdateStoryPayload as SharedUpdateStoryPayload,
  UpdateTaskPayload as SharedUpdateTaskPayload,
  ProductArtifactVersion,
  SaveProductArtifactInput,
  FileChangesReviewSession,
  SnapshotMeta,
} from '@nakiros/shared';

interface CreateStoryPayload extends SharedCreateStoryPayload {}
interface UpdateStoryPayload extends SharedUpdateStoryPayload {}
interface BacklogStory extends SharedBacklogStory {}
interface CreateEpicPayload extends SharedCreateEpicPayload {}
interface UpdateEpicPayload extends SharedUpdateEpicPayload {}
interface BacklogEpic extends SharedBacklogEpic {}
interface BacklogSprint extends SharedBacklogSprint {}
interface CreateSprintPayload extends SharedCreateSprintPayload {}
interface UpdateSprintPayload extends SharedUpdateSprintPayload {}
interface CreateTaskPayload extends SharedCreateTaskPayload {}
interface UpdateTaskPayload extends SharedUpdateTaskPayload {}
interface BacklogTask extends SharedBacklogTask {}

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

  interface ContextConflict {
    type: 'global' | 'repo';
    repoName?: string;
    updatedBy?: string;
    remoteUpdatedAt?: string;
  }

  interface ContextPushResult {
    status: 'ok' | 'conflict' | 'offline' | 'unauthenticated';
    conflict?: ContextConflict;
  }

  interface ContextPullResult {
    status: 'ok' | 'offline' | 'unauthenticated';
    reposPulled: string[];
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
      workspaceListMembers(workspaceId: string): Promise<WorkspaceMembershipListPayload>;
      workspaceUpsertMember(workspaceId: string, input: UpsertWorkspaceMembershipInput): Promise<WorkspaceMembershipListPayload>;
      workspaceRemoveMember(workspaceId: string, userId: string): Promise<void>;
      saveWorkspace(w: StoredWorkspace): Promise<void>;
      saveWorkspaceCanonical(w: StoredWorkspace): Promise<void>;
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
      providerCredentialsGetAll(): Promise<ProviderCredentialSummary[]>;
      providerCredentialCreate(input: CreateProviderCredentialInput): Promise<ProviderCredentialSummary>;
      providerCredentialUpdate(credentialId: string, input: UpdateProviderCredentialInput): Promise<ProviderCredentialSummary>;
      providerCredentialRevoke(credentialId: string): Promise<ProviderCredentialSummary>;
      providerCredentialDelete(credentialId: string, force?: boolean): Promise<ProviderCredentialDeleteImpact>;
      workspaceProviderCredentialsGet(workspaceId: string): Promise<WorkspaceProviderCredentialsPayload>;
      workspaceProviderCredentialBind(workspaceId: string, input: BindWorkspaceProviderCredentialInput): Promise<WorkspaceProviderCredentialsPayload>;
      workspaceProviderCredentialUnbind(workspaceId: string, credentialId: string): Promise<WorkspaceProviderCredentialsPayload>;
      workspaceProviderCredentialSetDefault(workspaceId: string, input: SetWorkspaceProviderDefaultInput): Promise<WorkspaceProviderCredentialsPayload>;
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

      // Backlog
      backlogGetStories(workspaceId: string): Promise<BacklogStory[]>;
      backlogGetEpics(workspaceId: string): Promise<BacklogEpic[]>;
      backlogCreateEpic(workspaceId: string, body: CreateEpicPayload): Promise<BacklogEpic>;
      backlogUpdateEpic(workspaceId: string, epicId: string, body: UpdateEpicPayload): Promise<BacklogEpic>;
      backlogCreateStory(workspaceId: string, body: CreateStoryPayload): Promise<BacklogStory>;
      backlogUpdateStory(workspaceId: string, storyId: string, body: UpdateStoryPayload): Promise<BacklogStory>;
      backlogGetTasks(workspaceId: string, storyId: string): Promise<BacklogTask[]>;
      backlogCreateTask(workspaceId: string, storyId: string, body: CreateTaskPayload): Promise<BacklogTask>;
      backlogUpdateTask(workspaceId: string, storyId: string, taskId: string, body: UpdateTaskPayload): Promise<BacklogTask>;
      backlogGetSprints(workspaceId: string): Promise<BacklogSprint[]>;
      backlogCreateSprint(workspaceId: string, body: CreateSprintPayload): Promise<BacklogSprint>;
      backlogUpdateSprint(workspaceId: string, sprintId: string, body: UpdateSprintPayload): Promise<BacklogSprint>;

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
      agentActionExecute(workspaceId: string, block: NakirosActionBlock): Promise<string>;
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

      // Context sync
      pushContext(workspace: StoredWorkspace, force?: boolean): Promise<ContextPushResult>;
      pullContext(workspace: StoredWorkspace): Promise<ContextPullResult>;

      // Docs
      scanDocs(workspace: StoredWorkspace): Promise<ScanResult>;
      readDoc(absolutePath: string): Promise<string>;
      writeDoc(absolutePath: string, content: string): Promise<void>;
      watchDoc(absolutePath: string): Promise<void>;
      unwatchDoc(absolutePath: string): Promise<void>;
      onDocChanged(cb: (absolutePath: string) => void): () => void;

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

      // Artifacts
      artifactListVersions(workspaceId: string, artifactPath: string): Promise<ProductArtifactVersion[]>;
      artifactSaveVersion(workspaceId: string, workspace: StoredWorkspace, input: SaveProductArtifactInput): Promise<ProductArtifactVersion | null>;
      artifactListAll(workspaceId: string): Promise<ProductArtifactVersion[]>;
      artifactPullAll(workspaceId: string, workspace: StoredWorkspace): Promise<{ pulled: number; failed: number }>;
      artifactListContextFiles(workspace: StoredWorkspace): Promise<string[]>;
      artifactReadFile(workspace: StoredWorkspace, artifactPath: string): Promise<string | null>;
      artifactGetFilePath(workspace: StoredWorkspace, artifactPath: string): Promise<string>;

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

      // Auth
      authGetState(): Promise<AuthState>;
      orgGetMine(): Promise<OrganizationInfo | undefined>;
      orgListMine(): Promise<OrganizationInfo[]>;
      orgCreate(name: string, slug: string): Promise<{ organizationId: string; organizationName: string; organizationSlug: string }>;
      orgDelete(orgId: string): Promise<void>;
      orgListMembers(orgId: string): Promise<OrganizationMemberListItem[]>;
      orgAddMember(orgId: string, email: string, role: OrgRole, inviterEmail?: string): Promise<OrganizationInvitationResult>;
      orgLeave(orgId: string): Promise<void>;
      orgCancelInvitation(orgId: string, invitationId: string): Promise<void>;
      orgAcceptInvitations(email: string): Promise<OrganizationInvitationAcceptanceResult>;
      orgRemoveMember(orgId: string, userId: string): Promise<void>;
      authSignIn(): Promise<void>;
      authSignOut(): Promise<void>;
      onAuthComplete(cb: (data: AuthCompletePayload) => void): () => void;
      onAuthError(cb: (data: AuthErrorPayload) => void): () => void;
      onAuthSignedOut(cb: (data: AuthSignedOutPayload) => void): () => void;
      onSyncEvent(cb: (event: { type: string; [key: string]: unknown }) => void): () => void;
    };
  }
}
