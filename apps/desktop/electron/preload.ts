import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@nakiros/shared';
import type {
  AgentRunRequest,
  AgentProvider,
  NakirosActionBlock,
  AuthCompletePayload,
  AuthErrorPayload,
  AuthSignedOutPayload,
  AuthState,
  BindWorkspaceProviderCredentialInput,
  CreateProviderCredentialInput,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraBoardSelection,
  JiraProject,
  JiraStatus,
  JiraSyncResult,
  JiraTicketCount,
  OrgRole,
  OrganizationInfo,
  OrganizationInvitationAcceptanceResult,
  OrganizationInvitationResult,
  OrganizationMemberListItem,
  ProviderCredentialDeleteImpact,
  ProviderCredentialSummary,
  ResolvedLanguage,
  SetWorkspaceProviderDefaultInput,
  StoredWorkspace,
  StoredConversation,
  StoredAgentTabsState,
  UpsertWorkspaceMembershipInput,
  UpdateProviderCredentialInput,
  WorkspaceMembershipListPayload,
  WorkspaceProviderCredentialsPayload,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  BacklogEpic,
  BacklogSprint,
  BacklogStory,
  BacklogTask,
  CreateEpicPayload,
  CreateSprintPayload,
  CreateStoryPayload,
  CreateTaskPayload,
  UpdateEpicPayload,
  UpdateSprintPayload,
  UpdateStoryPayload,
  UpdateTaskPayload,
  ProductArtifactVersion,
  SaveProductArtifactInput,
} from '@nakiros/shared';

function isMissingHandlerError(err: unknown, channel: string): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes(`No handler registered for '${channel}'`);
}

contextBridge.exposeInMainWorld('nakiros', {
  // Workspace
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS['dialog:selectDirectory']),
  openFilePicker: () => ipcRenderer.invoke(IPC_CHANNELS['dialog:openFile']),
  getWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS['workspace:getAll']),
  workspaceListMembers: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:listMembers'], workspaceId) as Promise<WorkspaceMembershipListPayload>,
  workspaceUpsertMember: (workspaceId: string, input: UpsertWorkspaceMembershipInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:upsertMember'], workspaceId, input) as Promise<WorkspaceMembershipListPayload>,
  workspaceRemoveMember: (workspaceId: string, userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:removeMember'], workspaceId, userId) as Promise<void>,
  saveWorkspace: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:save'], w),
  saveWorkspaceCanonical: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:saveCanonical'], w),
  deleteWorkspace: (id: string) => ipcRenderer.invoke(IPC_CHANNELS['workspace:delete'], id),
  createWorkspaceRoot: (parentDir: string, workspaceName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:createRoot'], parentDir, workspaceName),
  detectProfile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS['repo:detectProfile'], path),
  copyLocalRepo: (sourcePath: string, targetParentDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['repo:copyLocal'], sourcePath, targetParentDir),
  syncWorkspace: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:sync'], w),
  syncWorkspaceYaml: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:syncYaml'], w),
  getWorkspaceGettingStartedContext: (w: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:getStartedContext'], w) as Promise<WorkspaceGettingStartedContext>,
  saveWorkspaceGettingStartedState: (workspaceName: string, state: WorkspaceGettingStartedState) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:saveStartedState'], workspaceName, state) as Promise<void>,
  resetWorkspace: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:reset'], w),
  openPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS['shell:openPath'], path),
  gitRemoteUrl: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['git:remoteUrl'], repoPath),
  gitClone: (url: string, parentDir: string) => ipcRenderer.invoke(IPC_CHANNELS['git:clone'], url, parentDir),
  gitInit: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['git:init'], repoPath),
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS['preferences:get']),
  getSystemLanguage: () => ipcRenderer.invoke(IPC_CHANNELS['preferences:getSystemLanguage']) as Promise<ResolvedLanguage>,
  savePreferences: (prefs: unknown) => ipcRenderer.invoke(IPC_CHANNELS['preferences:save'], prefs),
  providerCredentialsGetAll: () => ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:getAll']) as Promise<ProviderCredentialSummary[]>,
  providerCredentialCreate: (input: CreateProviderCredentialInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:create'], input) as Promise<ProviderCredentialSummary>,
  providerCredentialUpdate: (credentialId: string, input: UpdateProviderCredentialInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:update'], credentialId, input) as Promise<ProviderCredentialSummary>,
  providerCredentialRevoke: (credentialId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:revoke'], credentialId) as Promise<ProviderCredentialSummary>,
  providerCredentialDelete: (credentialId: string, force?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:delete'], credentialId, force) as Promise<ProviderCredentialDeleteImpact>,
  workspaceProviderCredentialsGet: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:getWorkspace'], workspaceId) as Promise<WorkspaceProviderCredentialsPayload>,
  workspaceProviderCredentialBind: (workspaceId: string, input: BindWorkspaceProviderCredentialInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:bindWorkspace'], workspaceId, input) as Promise<WorkspaceProviderCredentialsPayload>,
  workspaceProviderCredentialUnbind: (workspaceId: string, credentialId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:unbindWorkspace'], workspaceId, credentialId) as Promise<WorkspaceProviderCredentialsPayload>,
  workspaceProviderCredentialSetDefault: (workspaceId: string, input: SetWorkspaceProviderDefaultInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['providerCredentials:setWorkspaceDefault'], workspaceId, input) as Promise<WorkspaceProviderCredentialsPayload>,
  getAgentInstallStatus: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['agents:status'], repoPath),
  installAgents: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS['agents:install'], request),
  getGlobalInstallStatus: () => ipcRenderer.invoke(IPC_CHANNELS['agents:global-status']),
  getInstalledCommands: () => ipcRenderer.invoke(IPC_CHANNELS['agents:installed-commands']),
  installAgentsGlobal: () => ipcRenderer.invoke(IPC_CHANNELS['agents:install-global']),
  getAgentCliStatus: () => ipcRenderer.invoke(IPC_CHANNELS['agents:cli-status']),

  // Backlog
  backlogGetStories: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:getStories'], workspaceId) as Promise<BacklogStory[]>,
  backlogGetEpics: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:getEpics'], workspaceId) as Promise<BacklogEpic[]>,
  backlogCreateEpic: (workspaceId: string, body: CreateEpicPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:createEpic'], workspaceId, body) as Promise<BacklogEpic>,
  backlogUpdateEpic: (workspaceId: string, epicId: string, body: UpdateEpicPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:updateEpic'], workspaceId, epicId, body) as Promise<BacklogEpic>,
  backlogCreateStory: (workspaceId: string, body: CreateStoryPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:createStory'], workspaceId, body) as Promise<BacklogStory>,
  backlogUpdateStory: (workspaceId: string, storyId: string, body: UpdateStoryPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:updateStory'], workspaceId, storyId, body) as Promise<BacklogStory>,
  backlogGetTasks: (workspaceId: string, storyId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:getTasks'], workspaceId, storyId) as Promise<BacklogTask[]>,
  backlogCreateTask: (workspaceId: string, storyId: string, body: CreateTaskPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:createTask'], workspaceId, storyId, body) as Promise<BacklogTask>,
  backlogUpdateTask: (workspaceId: string, storyId: string, taskId: string, body: UpdateTaskPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:updateTask'], workspaceId, storyId, taskId, body) as Promise<BacklogTask>,
  backlogGetSprints: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:getSprints'], workspaceId) as Promise<BacklogSprint[]>,
  backlogCreateSprint: (workspaceId: string, body: CreateSprintPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:createSprint'], workspaceId, body) as Promise<BacklogSprint>,
  backlogUpdateSprint: (workspaceId: string, sprintId: string, body: UpdateSprintPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS['backlog:updateSprint'], workspaceId, sprintId, body) as Promise<BacklogSprint>,

  // Tickets
  getTickets: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['ticket:getAll'], wsId),
  saveTicket: (wsId: string, t: unknown) => ipcRenderer.invoke(IPC_CHANNELS['ticket:save'], wsId, t),
  removeTicket: (wsId: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS['ticket:remove'], wsId, id),

  // Epics
  getEpics: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['epic:getAll'], wsId),
  saveEpic: (wsId: string, e: unknown) => ipcRenderer.invoke(IPC_CHANNELS['epic:save'], wsId, e),
  removeEpic: (wsId: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS['epic:remove'], wsId, id),

  // Agent context + clipboard
  generateContext: (wsId: string, ticketId: string, ws: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['agent:context'], wsId, ticketId, ws),
  writeClipboard: (text: string) => ipcRenderer.invoke(IPC_CHANNELS['clipboard:write'], text),

  // Agent runner
  agentRun: (request: AgentRunRequest) => ipcRenderer.invoke(IPC_CHANNELS['agent:run'], request),
  agentCancel: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['agent:cancel'], runId),
  agentActionExecute: (workspaceId: string, block: NakirosActionBlock): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS['agent:action-execute'], workspaceId, block) as Promise<string>,
  onAgentStart: (cb: (event: { runId: string; command: string; cwd: string; conversationId?: string; agentId?: string }) => void) => {
    const listener = (_: unknown, payload: { runId: string; command: string; cwd: string; conversationId?: string; agentId?: string }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['agent:start'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['agent:start'], listener);
  },
  onAgentEvent: (cb: (payload: { runId: string; event: unknown }) => void) => {
    const listener = (_: unknown, payload: { runId: string; event: unknown }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['agent:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['agent:event'], listener);
  },
  onAgentDone: (cb: (event: { runId: string; exitCode: number; error?: string; rawLines?: unknown[] }) => void) => {
    const listener = (_: unknown, payload: { runId: string; exitCode: number; error?: string; rawLines?: unknown[] }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['agent:done'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['agent:done'], listener);
  },
  showAgentRunNotification: (payload: {
    workspaceId: string;
    workspaceName?: string;
    conversationId?: string | null;
    tabId?: string | null;
    conversationTitle?: string;
    provider?: AgentProvider;
    durationSeconds: number;
  }) => ipcRenderer.invoke(IPC_CHANNELS['notification:showAgentRun'], payload),
  onOpenAgentRunChat: (cb: (payload: {
    workspaceId: string;
    conversationId?: string | null;
    tabId?: string | null;
    eventId?: string;
  }) => void) => {
    const listener = (
      _: unknown,
      payload: { workspaceId: string; conversationId?: string | null; tabId?: string | null; eventId?: string },
    ) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['notification:openAgentChat'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['notification:openAgentChat'], listener);
  },

  // Terminal
  terminalCreate: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['terminal:create'], repoPath),
  terminalWrite: (terminalId: string, data: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['terminal:write'], terminalId, data),
  terminalResize: (terminalId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['terminal:resize'], terminalId, cols, rows),
  terminalDestroy: (terminalId: string) => ipcRenderer.invoke(IPC_CHANNELS['terminal:destroy'], terminalId),
  onTerminalData: (cb: (event: { terminalId: string; data: string }) => void) => {
    const listener = (_: unknown, payload: { terminalId: string; data: string }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['terminal:data'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['terminal:data'], listener);
  },
  onTerminalExit: (cb: (event: { terminalId: string; code: number }) => void) => {
    const listener = (_: unknown, payload: { terminalId: string; code: number }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['terminal:exit'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['terminal:exit'], listener);
  },

  // Conversations
  getConversations: (workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS['conversation:getAll'], workspaceId),
  saveConversation: (conv: StoredConversation) => ipcRenderer.invoke(IPC_CHANNELS['conversation:save'], conv),
  deleteConversation: (id: string, workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS['conversation:delete'], id, workspaceId),
  getAgentTabs: async (workspaceId: string) => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS['agentTabs:get'], workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS['agentTabs:get'])) return null;
      throw err;
    }
  },
  saveAgentTabs: async (workspaceId: string, state: StoredAgentTabsState) => {
    try {
      await ipcRenderer.invoke(IPC_CHANNELS['agentTabs:save'], workspaceId, state);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS['agentTabs:save'])) return;
      throw err;
    }
  },
  clearAgentTabs: async (workspaceId: string) => {
    try {
      await ipcRenderer.invoke(IPC_CHANNELS['agentTabs:clear'], workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS['agentTabs:clear'])) return;
      throw err;
    }
  },

  // Jira OAuth
  jiraStartAuth: (wsId: string, jiraUrl?: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:startAuth'], wsId, jiraUrl),
  jiraDisconnect: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:disconnect'], wsId),
  jiraGetStatus: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:getStatus'], wsId) as Promise<JiraStatus>,
  jiraSyncTickets: (wsId: string, ws: StoredWorkspace) => ipcRenderer.invoke(IPC_CHANNELS['jira:syncTickets'], wsId, ws) as Promise<JiraSyncResult>,
  jiraGetProjects: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:getProjects'], wsId) as Promise<JiraProject[]>,
  jiraGetBoardType: (wsId: string, projectKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['jira:getBoardType'], wsId, projectKey) as Promise<JiraBoardSelection>,
  jiraCountTickets: (wsId: string, projectKey: string, syncFilter: string, boardType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['jira:countTickets'], wsId, projectKey, syncFilter, boardType) as Promise<JiraTicketCount>,

  onJiraAuthComplete: (cb: (data: JiraAuthCompletePayload) => void) => {
    const listener = (_: unknown, data: JiraAuthCompletePayload) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['jira:auth-complete'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['jira:auth-complete'], listener);
  },
  onJiraAuthError: (cb: (data: JiraAuthErrorPayload) => void) => {
    const listener = (_: unknown, data: JiraAuthErrorPayload) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['jira:auth-error'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['jira:auth-error'], listener);
  },

  // Context sync
  pushContext: (workspace: StoredWorkspace, force?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS['context:push'], workspace, force),
  pullContext: (workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['context:pull'], workspace),

  // Docs
  scanDocs: (workspace: StoredWorkspace) => ipcRenderer.invoke(IPC_CHANNELS['docs:scan'], workspace),
  readDoc: (absolutePath: string) => ipcRenderer.invoke(IPC_CHANNELS['docs:read'], absolutePath),
  writeDoc: (absolutePath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS['docs:write'], absolutePath, content),
  watchDoc: (absolutePath: string) => ipcRenderer.invoke(IPC_CHANNELS['docs:watch'], absolutePath),
  unwatchDoc: (absolutePath: string) => ipcRenderer.invoke(IPC_CHANNELS['docs:unwatch'], absolutePath),
  onDocChanged: (cb: (absolutePath: string) => void) => {
    const listener = (_: unknown, absolutePath: string) => cb(absolutePath);
    ipcRenderer.on(IPC_CHANNELS['docs:changed'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['docs:changed'], listener);
  },

  // Artifacts
  artifactListVersions: (workspaceId: string, artifactPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:listVersions'], workspaceId, artifactPath) as Promise<ProductArtifactVersion[]>,
  artifactSaveVersion: (workspaceId: string, workspace: StoredWorkspace, input: SaveProductArtifactInput) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:saveVersion'], workspaceId, workspace, input) as Promise<ProductArtifactVersion | null>,
  artifactListAll: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:listAll'], workspaceId) as Promise<ProductArtifactVersion[]>,
  artifactPullAll: (workspaceId: string, workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:pullAll'], workspaceId, workspace) as Promise<{ pulled: number; failed: number }>,
  artifactListContextFiles: (workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:listContextFiles'], workspace) as Promise<string[]>,
  artifactReadFile: (workspace: StoredWorkspace, artifactPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:readFile'], workspace, artifactPath) as Promise<string | null>,
  artifactGetFilePath: (workspace: StoredWorkspace, artifactPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:getFilePath'], workspace, artifactPath) as Promise<string>,

  // Snapshots
  snapshotTake: (workspaceSlug: string, runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['snapshot:take'], workspaceSlug, runId) as Promise<void>,
  snapshotDiff: (workspaceSlug: string, runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['snapshot:diff'], workspaceSlug, runId) as Promise<import('@nakiros/shared').FileChangesReviewSession | null>,
  snapshotRevert: (workspaceSlug: string, runId: string, relativePaths?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS['snapshot:revert'], workspaceSlug, runId, relativePaths) as Promise<void>,
  snapshotResolve: (workspaceSlug: string, runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['snapshot:resolve'], workspaceSlug, runId) as Promise<void>,
  snapshotListPending: (workspaceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['snapshot:listPending'], workspaceSlug) as Promise<import('@nakiros/shared').SnapshotMeta[]>,

  previewCheck: (workspaceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['preview:check'], workspaceSlug) as Promise<{ exists: boolean; previewRoot: string; files: string[]; conversationId: string | null }>,
  previewApply: (previewRoot: string, workspaceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['preview:apply'], previewRoot, workspaceSlug) as Promise<void>,
  previewApplyFile: (previewRoot: string, filePath: string, workspaceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['preview:apply-file'], previewRoot, filePath, workspaceSlug) as Promise<void>,
  previewDiscard: (previewRoot: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['preview:discard'], previewRoot) as Promise<void>,

  // MCP Server
  getServerStatus: () => ipcRenderer.invoke(IPC_CHANNELS['server:getStatus']),
  restartServer: () => ipcRenderer.invoke(IPC_CHANNELS['server:restart']),
  onServerStatusChange: (cb: (status: 'starting' | 'running' | 'stopped') => void) => {
    const listener = (_: unknown, status: 'starting' | 'running' | 'stopped') => cb(status);
    ipcRenderer.on(IPC_CHANNELS['server:status-change'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['server:status-change'], listener);
  },

  // Onboarding
  nakirosConfigExists: () => ipcRenderer.invoke(IPC_CHANNELS['onboarding:nakirosConfigExists']),
  onboardingDetectEditors: () => ipcRenderer.invoke(IPC_CHANNELS['onboarding:detectEditors']),
  onboardingInstall: (editors: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS['onboarding:install'], editors),
  onOnboardingProgress: (cb: (event: { label: string; done: boolean; error?: string }) => void) => {
    const listener = (_: unknown, payload: { label: string; done: boolean; error?: string }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['onboarding:progress'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['onboarding:progress'], listener);
  },

  // Updates
  checkForUpdates: (force?: boolean, channel?: string) => ipcRenderer.invoke(IPC_CHANNELS['updates:check'], force, channel),
  applyUpdate: (files: unknown[], bundleVersion: string) => ipcRenderer.invoke(IPC_CHANNELS['updates:apply'], files, bundleVersion),
  getVersionInfo: () => ipcRenderer.invoke(IPC_CHANNELS['updates:getVersionInfo']),
  onUpdatesAvailable: (cb: (result: unknown) => void) => {
    const listener = (_: unknown, result: unknown) => cb(result);
    ipcRenderer.on(IPC_CHANNELS['updates:available'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['updates:available'], listener);
  },
  onUpdatesProgress: (cb: (event: { file: string; done: boolean; error?: string }) => void) => {
    const listener = (_: unknown, payload: { file: string; done: boolean; error?: string }) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['updates:progress'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['updates:progress'], listener);
  },

  // Feedback
  sendSessionFeedback: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['feedback:sendSession'], data),
  sendProductFeedback: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['feedback:sendProduct'], data),

  // Auth
  authGetState: () => ipcRenderer.invoke(IPC_CHANNELS['auth:getState']) as Promise<AuthState>,
  orgGetMine: () => ipcRenderer.invoke(IPC_CHANNELS['org:getMine']) as Promise<OrganizationInfo | undefined>,
  orgListMine: () => ipcRenderer.invoke(IPC_CHANNELS['org:listMine']) as Promise<OrganizationInfo[]>,
  orgCreate: (name: string, slug: string) => ipcRenderer.invoke(IPC_CHANNELS['org:create'], name, slug) as Promise<{ organizationId: string; organizationName: string; organizationSlug: string }>,
  orgDelete: (orgId: string) => ipcRenderer.invoke(IPC_CHANNELS['org:delete'], orgId) as Promise<void>,
  orgListMembers: (orgId: string) => ipcRenderer.invoke(IPC_CHANNELS['org:listMembers'], orgId) as Promise<OrganizationMemberListItem[]>,
  orgAddMember: (orgId: string, email: string, role: OrgRole, inviterEmail?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['org:addMember'], orgId, email, role, inviterEmail) as Promise<OrganizationInvitationResult>,
  orgLeave: (orgId: string) => ipcRenderer.invoke(IPC_CHANNELS['org:leave'], orgId) as Promise<void>,
  orgCancelInvitation: (orgId: string, invitationId: string) => ipcRenderer.invoke(IPC_CHANNELS['org:cancelInvitation'], orgId, invitationId) as Promise<void>,
  orgAcceptInvitations: (email: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['org:acceptInvitations'], email) as Promise<OrganizationInvitationAcceptanceResult>,
  orgRemoveMember: (orgId: string, userId: string) => ipcRenderer.invoke(IPC_CHANNELS['org:removeMember'], orgId, userId) as Promise<void>,
  authSignIn: () => ipcRenderer.invoke(IPC_CHANNELS['auth:signIn']),
  authSignOut: () => ipcRenderer.invoke(IPC_CHANNELS['auth:signOut']),
  onAuthComplete: (cb: (data: AuthCompletePayload) => void) => {
    const listener = (_: unknown, data: AuthCompletePayload) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['auth:complete'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['auth:complete'], listener);
  },
  onAuthError: (cb: (data: AuthErrorPayload) => void) => {
    const listener = (_: unknown, data: AuthErrorPayload) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['auth:error'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['auth:error'], listener);
  },
  onAuthSignedOut: (cb: (data: AuthSignedOutPayload) => void) => {
    const listener = (_: unknown, data: AuthSignedOutPayload) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['auth:signedOut'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['auth:signedOut'], listener);
  },

  // Artifact sync
  onSyncEvent: (cb: (event: { type: string; [key: string]: unknown }) => void) => {
    const listener = (_: unknown, event: { type: string; [key: string]: unknown }) => cb(event);
    ipcRenderer.on(IPC_CHANNELS['sync:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['sync:event'], listener);
  },
});
