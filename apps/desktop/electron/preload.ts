import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@nakiros/shared';
import type {
  AgentRunRequest,
  AgentProvider,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraBoardSelection,
  JiraProject,
  JiraStatus,
  JiraSyncResult,
  JiraTicketCount,
  ResolvedLanguage,
  StoredWorkspace,
  StoredConversation,
  StoredAgentTabsState,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  Project,
  ProjectConversation,
  ConversationMessage,
  Skill,
  ScanProgress,
  StartEvalRunRequest,
  StartEvalRunResponse,
  SkillEvalRun,
  EvalRunEvent,
  EvalRunOutputEntry,
  StartAuditRequest,
  AuditRun,
  AuditRunEvent,
  AuditHistoryEntry,
  FixBenchmarks,
  SkillAgentTempFileEntry,
  SkillAgentTempFileContent,
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

  // Artifacts (local only)
  artifactListContextFiles: (workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:listContextFiles'], workspace) as Promise<string[]>,
  artifactReadFile: (workspace: StoredWorkspace, artifactPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:readFile'], workspace, artifactPath) as Promise<string | null>,
  artifactGetFilePath: (workspace: StoredWorkspace, artifactPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:getFilePath'], workspace, artifactPath) as Promise<string>,
  artifactGetContextTotalBytes: (workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:getContextTotalBytes'], workspace) as Promise<number>,
  artifactListContextFilesWithSizes: (workspace: StoredWorkspace) =>
    ipcRenderer.invoke(IPC_CHANNELS['artifact:listContextFilesWithSizes'], workspace) as Promise<{ path: string; sizeBytes: number }[]>,

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

  // ─── Nakiros Agent Team — Projects ───────────────────────────────────────────
  scanProjects: () => ipcRenderer.invoke(IPC_CHANNELS['project:scan']) as Promise<Project[]>,
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS['project:list']) as Promise<Project[]>,
  getProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS['project:get'], id) as Promise<Project | null>,
  dismissProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS['project:dismiss'], id) as Promise<void>,

  listProjectConversations: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:listConversations'], projectId) as Promise<ProjectConversation[]>,
  getProjectConversationMessages: (projectId: string, sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:getConversationMessages'], projectId, sessionId) as Promise<ConversationMessage[]>,

  listProjectSkills: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:listSkills'], projectId) as Promise<Skill[]>,
  getProjectSkill: (projectId: string, skillName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:getSkill'], projectId, skillName) as Promise<Skill | null>,
  saveProjectSkill: (projectId: string, skillName: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:saveSkill'], projectId, skillName, content) as Promise<void>,
  readSkillFile: (projectId: string, skillName: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:readSkillFile'], projectId, skillName, relativePath) as Promise<string | null>,
  saveSkillFile: (projectId: string, skillName: string, relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['project:saveSkillFile'], projectId, skillName, relativePath, content) as Promise<void>,

  // Nakiros bundled skills
  listBundledSkills: () => ipcRenderer.invoke(IPC_CHANNELS['nakiros:listBundledSkills']) as Promise<Skill[]>,
  getBundledSkill: (skillName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['nakiros:getBundledSkill'], skillName) as Promise<Skill | null>,
  readBundledSkillFile: (skillName: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['nakiros:readBundledSkillFile'], skillName, relativePath) as Promise<string | null>,
  saveBundledSkillFile: (skillName: string, relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['nakiros:saveBundledSkillFile'], skillName, relativePath, content) as Promise<void>,
  promoteBundledSkill: (skillName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['nakiros:promoteBundledSkill'], skillName) as Promise<string>,

  // User-global skills (~/.claude/skills/, excluding our symlinks)
  listClaudeGlobalSkills: () => ipcRenderer.invoke(IPC_CHANNELS['claudeGlobal:listSkills']) as Promise<Skill[]>,
  getClaudeGlobalSkill: (skillName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['claudeGlobal:getSkill'], skillName) as Promise<Skill | null>,
  readClaudeGlobalSkillFile: (skillName: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['claudeGlobal:readSkillFile'], skillName, relativePath) as Promise<string | null>,
  readSkillFileAsDataUrl: (request: { scope: 'project' | 'nakiros-bundled' | 'claude-global'; projectId?: string; skillName: string; relativePath: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS['skill:readFileAsDataUrl'], request) as Promise<string | null>,
  saveClaudeGlobalSkillFile: (skillName: string, relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['claudeGlobal:saveSkillFile'], skillName, relativePath, content) as Promise<void>,

  onScanProgress: (cb: (progress: ScanProgress) => void) => {
    const listener = (_: unknown, payload: ScanProgress) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['project:scanProgress'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['project:scanProgress'], listener);
  },

  // Eval runner
  startEvalRuns: (request: StartEvalRunRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:startRuns'], request) as Promise<StartEvalRunResponse>,
  stopEvalRun: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:stopRun'], runId) as Promise<void>,
  listEvalRuns: () => ipcRenderer.invoke(IPC_CHANNELS['eval:listRuns']) as Promise<SkillEvalRun[]>,
  loadPersistedEvalRuns: (request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:loadPersisted'], request) as Promise<SkillEvalRun[]>,
  onEvalEvent: (cb: (event: EvalRunEvent) => void) => {
    const listener = (_: unknown, payload: EvalRunEvent) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['eval:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['eval:event'], listener);
  },
  sendEvalUserMessage: (runId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:sendUserMessage'], runId, message) as Promise<void>,
  finishEvalRun: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:finishRun'], runId) as Promise<void>,
  getEvalFeedback: (request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:getFeedback'], request) as Promise<Record<string, string>>,
  saveEvalFeedback: (request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number; evalName: string; feedback: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:saveFeedback'], request) as Promise<void>,
  listEvalRunOutputs: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:listOutputs'], runId) as Promise<EvalRunOutputEntry[]>,
  readEvalRunOutput: (runId: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['eval:readOutput'], runId, relativePath) as Promise<string | null>,

  // Audit
  startAudit: (request: StartAuditRequest) => ipcRenderer.invoke(IPC_CHANNELS['audit:start'], request) as Promise<AuditRun>,
  stopAudit: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['audit:stopRun'], runId) as Promise<void>,
  getAuditRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['audit:getRun'], runId) as Promise<AuditRun | null>,
  sendAuditUserMessage: (runId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['audit:sendUserMessage'], runId, message) as Promise<void>,
  listAuditHistory: (request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS['audit:listHistory'], request) as Promise<AuditHistoryEntry[]>,
  readAuditReport: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['audit:readReport'], path) as Promise<string | null>,
  listActiveAuditRuns: () =>
    ipcRenderer.invoke(IPC_CHANNELS['audit:listActive']) as Promise<AuditRun[]>,
  onAuditEvent: (cb: (event: AuditRunEvent) => void) => {
    const listener = (_: unknown, payload: AuditRunEvent) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['audit:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['audit:event'], listener);
  },

  // Fix
  startFix: (request: StartAuditRequest) => ipcRenderer.invoke(IPC_CHANNELS['fix:start'], request) as Promise<AuditRun>,
  stopFix: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['fix:stopRun'], runId) as Promise<void>,
  getFixRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['fix:getRun'], runId) as Promise<AuditRun | null>,
  sendFixUserMessage: (runId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['fix:sendUserMessage'], runId, message) as Promise<void>,
  finishFix: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['fix:finish'], runId) as Promise<void>,
  runFixEvalsInTemp: (request: { runId: string; evalNames?: string[]; includeBaseline?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS['fix:runEvalsInTemp'], request) as Promise<StartEvalRunResponse>,
  getFixBenchmarks: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['fix:getBenchmarks'], runId) as Promise<FixBenchmarks>,
  listActiveFixRuns: () =>
    ipcRenderer.invoke(IPC_CHANNELS['fix:listActive']) as Promise<AuditRun[]>,
  getFixBufferedEvents: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['fix:getBufferedEvents'], runId) as Promise<AuditRunEvent['event'][]>,
  onFixEvent: (cb: (event: AuditRunEvent) => void) => {
    const listener = (_: unknown, payload: AuditRunEvent) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['fix:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['fix:event'], listener);
  },

  // Create (skill-factory "create" command)
  startCreate: (request: StartAuditRequest) => ipcRenderer.invoke(IPC_CHANNELS['create:start'], request) as Promise<AuditRun>,
  stopCreate: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['create:stopRun'], runId) as Promise<void>,
  getCreateRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['create:getRun'], runId) as Promise<AuditRun | null>,
  sendCreateUserMessage: (runId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['create:sendUserMessage'], runId, message) as Promise<void>,
  finishCreate: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS['create:finish'], runId) as Promise<void>,
  listActiveCreateRuns: () =>
    ipcRenderer.invoke(IPC_CHANNELS['create:listActive']) as Promise<AuditRun[]>,
  getCreateBufferedEvents: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['create:getBufferedEvents'], runId) as Promise<AuditRunEvent['event'][]>,
  onCreateEvent: (cb: (event: AuditRunEvent) => void) => {
    const listener = (_: unknown, payload: AuditRunEvent) => cb(payload);
    ipcRenderer.on(IPC_CHANNELS['create:event'], listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['create:event'], listener);
  },

  // Draft files (shared by fix + create — previews what's in the temp workdir)
  listSkillAgentTempFiles: (runId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['skillAgent:listTempFiles'], runId) as Promise<SkillAgentTempFileEntry[]>,
  readSkillAgentTempFile: (runId: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['skillAgent:readTempFile'], runId, relativePath) as Promise<SkillAgentTempFileContent>,
});
