import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@nakiros/shared';
import type {
  AgentRunRequest,
  AgentProvider,
  AuthCompletePayload,
  AuthErrorPayload,
  AuthSignedOutPayload,
  AuthState,
  OrgRole,
  OrganizationInfo,
  OrganizationInvitationAcceptanceResult,
  OrganizationInvitationResult,
  OrganizationMemberListItem,
  ResolvedLanguage,
  StoredWorkspace,
  StoredConversation,
  StoredAgentTabsState,
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
  resetWorkspace: (w: unknown) => ipcRenderer.invoke(IPC_CHANNELS['workspace:reset'], w),
  openPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS['shell:openPath'], path),
  gitRemoteUrl: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['git:remoteUrl'], repoPath),
  gitClone: (url: string, parentDir: string) => ipcRenderer.invoke(IPC_CHANNELS['git:clone'], url, parentDir),
  gitInit: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['git:init'], repoPath),
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS['preferences:get']),
  getSystemLanguage: () => ipcRenderer.invoke(IPC_CHANNELS['preferences:getSystemLanguage']) as Promise<ResolvedLanguage>,
  savePreferences: (prefs: unknown) => ipcRenderer.invoke(IPC_CHANNELS['preferences:save'], prefs),
  getAgentInstallStatus: (repoPath: string) => ipcRenderer.invoke(IPC_CHANNELS['agents:status'], repoPath),
  installAgents: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS['agents:install'], request),
  getGlobalInstallStatus: () => ipcRenderer.invoke(IPC_CHANNELS['agents:global-status']),
  getInstalledCommands: () => ipcRenderer.invoke(IPC_CHANNELS['agents:installed-commands']),
  installAgentsGlobal: () => ipcRenderer.invoke(IPC_CHANNELS['agents:install-global']),
  getAgentCliStatus: () => ipcRenderer.invoke(IPC_CHANNELS['agents:cli-status']),

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
  onAgentStart: (cb: (event: { runId: string; command: string; cwd: string }) => void) => {
    const listener = (_: unknown, payload: { runId: string; command: string; cwd: string }) => cb(payload);
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
  jiraStartAuth: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:startAuth'], wsId),
  jiraDisconnect: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:disconnect'], wsId),
  jiraGetStatus: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:getStatus'], wsId),
  jiraSyncTickets: (wsId: string, ws: StoredWorkspace) => ipcRenderer.invoke(IPC_CHANNELS['jira:syncTickets'], wsId, ws),
  jiraGetProjects: (wsId: string) => ipcRenderer.invoke(IPC_CHANNELS['jira:getProjects'], wsId),
  jiraGetBoardType: (wsId: string, projectKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['jira:getBoardType'], wsId, projectKey),
  jiraCountTickets: (wsId: string, projectKey: string, syncFilter: string, boardType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['jira:countTickets'], wsId, projectKey, syncFilter, boardType),

  onJiraAuthComplete: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['jira:auth-complete'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['jira:auth-complete'], listener);
  },
  onJiraAuthError: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on(IPC_CHANNELS['jira:auth-error'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['jira:auth-error'], listener);
  },

  // Docs
  scanDocs: (workspace: StoredWorkspace) => ipcRenderer.invoke(IPC_CHANNELS['docs:scan'], workspace),
  readDoc: (absolutePath: string) => ipcRenderer.invoke(IPC_CHANNELS['docs:read'], absolutePath),

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
});
