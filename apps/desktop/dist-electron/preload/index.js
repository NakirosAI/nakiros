"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  "backlog:getStories": "backlog:getStories",
  "backlog:getEpics": "backlog:getEpics",
  "backlog:createEpic": "backlog:createEpic",
  "backlog:updateEpic": "backlog:updateEpic",
  "backlog:createStory": "backlog:createStory",
  "backlog:updateStory": "backlog:updateStory",
  "backlog:getTasks": "backlog:getTasks",
  "backlog:createTask": "backlog:createTask",
  "backlog:updateTask": "backlog:updateTask",
  "backlog:getSprints": "backlog:getSprints",
  "backlog:createSprint": "backlog:createSprint",
  "backlog:updateSprint": "backlog:updateSprint",
  "auth:complete": "auth:complete",
  "auth:continue": "auth:continue",
  "auth:error": "auth:error",
  "auth:getState": "auth:getState",
  "auth:openOAuthPopup": "auth:openOAuthPopup",
  "auth:signIn": "auth:signIn",
  "auth:signOut": "auth:signOut",
  "auth:signedOut": "auth:signedOut",
  "auth:submit": "auth:submit",
  "agent:action-execute": "agent:action-execute",
  "agent:cancel": "agent:cancel",
  "agent:context": "agent:context",
  "agent:done": "agent:done",
  "agent:event": "agent:event",
  "agent:run": "agent:run",
  "agent:start": "agent:start",
  "agentTabs:clear": "agentTabs:clear",
  "agentTabs:get": "agentTabs:get",
  "agentTabs:save": "agentTabs:save",
  "agents:cli-status": "agents:cli-status",
  "agents:global-status": "agents:global-status",
  "agents:installed-commands": "agents:installed-commands",
  "agents:install": "agents:install",
  "agents:install-global": "agents:install-global",
  "agents:status": "agents:status",
  "clipboard:write": "clipboard:write",
  "conversation:delete": "conversation:delete",
  "conversation:getAll": "conversation:getAll",
  "conversation:save": "conversation:save",
  "dialog:openFile": "dialog:openFile",
  "dialog:selectDirectory": "dialog:selectDirectory",
  "docs:changed": "docs:changed",
  "docs:read": "docs:read",
  "docs:scan": "docs:scan",
  "docs:unwatch": "docs:unwatch",
  "docs:watch": "docs:watch",
  "docs:write": "docs:write",
  "epic:getAll": "epic:getAll",
  "epic:remove": "epic:remove",
  "epic:save": "epic:save",
  "feedback:sendProduct": "feedback:sendProduct",
  "feedback:sendSession": "feedback:sendSession",
  "git:clone": "git:clone",
  "git:init": "git:init",
  "git:remoteUrl": "git:remoteUrl",
  "jira:auth-complete": "jira:auth-complete",
  "jira:auth-error": "jira:auth-error",
  "jira:countTickets": "jira:countTickets",
  "jira:disconnect": "jira:disconnect",
  "jira:getBoardType": "jira:getBoardType",
  "jira:getProjects": "jira:getProjects",
  "jira:getStatus": "jira:getStatus",
  "jira:startAuth": "jira:startAuth",
  "jira:syncTickets": "jira:syncTickets",
  "org:create": "org:create",
  "org:delete": "org:delete",
  "org:getMine": "org:getMine",
  "org:listMine": "org:listMine",
  "org:listMembers": "org:listMembers",
  "org:addMember": "org:addMember",
  "org:leave": "org:leave",
  "org:removeMember": "org:removeMember",
  "org:cancelInvitation": "org:cancelInvitation",
  "org:acceptInvitations": "org:acceptInvitations",
  "notification:openAgentChat": "notification:openAgentChat",
  "notification:showAgentRun": "notification:showAgentRun",
  "onboarding:detectEditors": "onboarding:detectEditors",
  "onboarding:install": "onboarding:install",
  "onboarding:nakirosConfigExists": "onboarding:nakirosConfigExists",
  "onboarding:progress": "onboarding:progress",
  "preferences:get": "preferences:get",
  "preferences:getSystemLanguage": "preferences:getSystemLanguage",
  "preferences:save": "preferences:save",
  "providerCredentials:bindWorkspace": "providerCredentials:bindWorkspace",
  "providerCredentials:create": "providerCredentials:create",
  "providerCredentials:delete": "providerCredentials:delete",
  "providerCredentials:getAll": "providerCredentials:getAll",
  "providerCredentials:getWorkspace": "providerCredentials:getWorkspace",
  "providerCredentials:revoke": "providerCredentials:revoke",
  "providerCredentials:setWorkspaceDefault": "providerCredentials:setWorkspaceDefault",
  "providerCredentials:unbindWorkspace": "providerCredentials:unbindWorkspace",
  "providerCredentials:update": "providerCredentials:update",
  "repo:copyLocal": "repo:copyLocal",
  "repo:detectProfile": "repo:detectProfile",
  "server:getStatus": "server:getStatus",
  "server:restart": "server:restart",
  "server:status-change": "server:status-change",
  "shell:openPath": "shell:openPath",
  "terminal:create": "terminal:create",
  "terminal:data": "terminal:data",
  "terminal:destroy": "terminal:destroy",
  "terminal:exit": "terminal:exit",
  "terminal:resize": "terminal:resize",
  "terminal:write": "terminal:write",
  "ticket:getAll": "ticket:getAll",
  "ticket:remove": "ticket:remove",
  "ticket:save": "ticket:save",
  "updates:apply": "updates:apply",
  "updates:available": "updates:available",
  "updates:check": "updates:check",
  "updates:getVersionInfo": "updates:getVersionInfo",
  "updates:progress": "updates:progress",
  "context:push": "context:push",
  "context:pull": "context:pull",
  "workspace:createRoot": "workspace:createRoot",
  "workspace:delete": "workspace:delete",
  "workspace:getAll": "workspace:getAll",
  "workspace:listMembers": "workspace:listMembers",
  "workspace:removeMember": "workspace:removeMember",
  "workspace:reset": "workspace:reset",
  "workspace:save": "workspace:save",
  "workspace:saveCanonical": "workspace:saveCanonical",
  "workspace:sync": "workspace:sync",
  "workspace:syncYaml": "workspace:syncYaml",
  "workspace:getStartedContext": "workspace:getStartedContext",
  "workspace:saveStartedState": "workspace:saveStartedState",
  "workspace:upsertMember": "workspace:upsertMember",
  "artifact:listVersions": "artifact:listVersions",
  "artifact:saveVersion": "artifact:saveVersion",
  "artifact:listAll": "artifact:listAll",
  "artifact:pullAll": "artifact:pullAll",
  "sync:event": "sync:event",
  "artifact:listContextFiles": "artifact:listContextFiles",
  "artifact:readFile": "artifact:readFile",
  "artifact:getFilePath": "artifact:getFilePath",
  "artifact:getContextTotalBytes": "artifact:getContextTotalBytes",
  "artifact:listContextFilesWithSizes": "artifact:listContextFilesWithSizes",
  "snapshot:take": "snapshot:take",
  "snapshot:diff": "snapshot:diff",
  "snapshot:revert": "snapshot:revert",
  "snapshot:resolve": "snapshot:resolve",
  "snapshot:listPending": "snapshot:listPending",
  "preview:check": "preview:check",
  "preview:apply": "preview:apply",
  "preview:apply-file": "preview:apply-file",
  "preview:discard": "preview:discard"
};
function isMissingHandlerError(err, channel) {
  if (!(err instanceof Error)) return false;
  return err.message.includes(`No handler registered for '${channel}'`);
}
electron.contextBridge.exposeInMainWorld("nakiros", {
  // Workspace
  selectDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS["dialog:selectDirectory"]),
  openFilePicker: () => electron.ipcRenderer.invoke(IPC_CHANNELS["dialog:openFile"]),
  getWorkspaces: () => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:getAll"]),
  workspaceListMembers: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:listMembers"], workspaceId),
  workspaceUpsertMember: (workspaceId, input) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:upsertMember"], workspaceId, input),
  workspaceRemoveMember: (workspaceId, userId) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:removeMember"], workspaceId, userId),
  saveWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:save"], w),
  saveWorkspaceCanonical: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:saveCanonical"], w),
  deleteWorkspace: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:delete"], id),
  createWorkspaceRoot: (parentDir, workspaceName) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:createRoot"], parentDir, workspaceName),
  detectProfile: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS["repo:detectProfile"], path),
  copyLocalRepo: (sourcePath, targetParentDir) => electron.ipcRenderer.invoke(IPC_CHANNELS["repo:copyLocal"], sourcePath, targetParentDir),
  syncWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:sync"], w),
  syncWorkspaceYaml: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:syncYaml"], w),
  getWorkspaceGettingStartedContext: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:getStartedContext"], w),
  saveWorkspaceGettingStartedState: (workspaceName, state) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:saveStartedState"], workspaceName, state),
  resetWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:reset"], w),
  openPath: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS["shell:openPath"], path),
  gitRemoteUrl: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:remoteUrl"], repoPath),
  gitClone: (url, parentDir) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:clone"], url, parentDir),
  gitInit: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:init"], repoPath),
  getPreferences: () => electron.ipcRenderer.invoke(IPC_CHANNELS["preferences:get"]),
  getSystemLanguage: () => electron.ipcRenderer.invoke(IPC_CHANNELS["preferences:getSystemLanguage"]),
  savePreferences: (prefs) => electron.ipcRenderer.invoke(IPC_CHANNELS["preferences:save"], prefs),
  providerCredentialsGetAll: () => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:getAll"]),
  providerCredentialCreate: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:create"], input),
  providerCredentialUpdate: (credentialId, input) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:update"], credentialId, input),
  providerCredentialRevoke: (credentialId) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:revoke"], credentialId),
  providerCredentialDelete: (credentialId, force) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:delete"], credentialId, force),
  workspaceProviderCredentialsGet: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:getWorkspace"], workspaceId),
  workspaceProviderCredentialBind: (workspaceId, input) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:bindWorkspace"], workspaceId, input),
  workspaceProviderCredentialUnbind: (workspaceId, credentialId) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:unbindWorkspace"], workspaceId, credentialId),
  workspaceProviderCredentialSetDefault: (workspaceId, input) => electron.ipcRenderer.invoke(IPC_CHANNELS["providerCredentials:setWorkspaceDefault"], workspaceId, input),
  getAgentInstallStatus: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:status"], repoPath),
  installAgents: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:install"], request),
  getGlobalInstallStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:global-status"]),
  getInstalledCommands: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:installed-commands"]),
  installAgentsGlobal: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:install-global"]),
  getAgentCliStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:cli-status"]),
  // Backlog
  backlogGetStories: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:getStories"], workspaceId),
  backlogGetEpics: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:getEpics"], workspaceId),
  backlogCreateEpic: (workspaceId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:createEpic"], workspaceId, body),
  backlogUpdateEpic: (workspaceId, epicId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:updateEpic"], workspaceId, epicId, body),
  backlogCreateStory: (workspaceId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:createStory"], workspaceId, body),
  backlogUpdateStory: (workspaceId, storyId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:updateStory"], workspaceId, storyId, body),
  backlogGetTasks: (workspaceId, storyId) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:getTasks"], workspaceId, storyId),
  backlogCreateTask: (workspaceId, storyId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:createTask"], workspaceId, storyId, body),
  backlogUpdateTask: (workspaceId, storyId, taskId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:updateTask"], workspaceId, storyId, taskId, body),
  backlogGetSprints: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:getSprints"], workspaceId),
  backlogCreateSprint: (workspaceId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:createSprint"], workspaceId, body),
  backlogUpdateSprint: (workspaceId, sprintId, body) => electron.ipcRenderer.invoke(IPC_CHANNELS["backlog:updateSprint"], workspaceId, sprintId, body),
  // Tickets
  getTickets: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["ticket:getAll"], wsId),
  saveTicket: (wsId, t) => electron.ipcRenderer.invoke(IPC_CHANNELS["ticket:save"], wsId, t),
  removeTicket: (wsId, id) => electron.ipcRenderer.invoke(IPC_CHANNELS["ticket:remove"], wsId, id),
  // Epics
  getEpics: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["epic:getAll"], wsId),
  saveEpic: (wsId, e) => electron.ipcRenderer.invoke(IPC_CHANNELS["epic:save"], wsId, e),
  removeEpic: (wsId, id) => electron.ipcRenderer.invoke(IPC_CHANNELS["epic:remove"], wsId, id),
  // Agent context + clipboard
  generateContext: (wsId, ticketId, ws) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:context"], wsId, ticketId, ws),
  writeClipboard: (text) => electron.ipcRenderer.invoke(IPC_CHANNELS["clipboard:write"], text),
  // Agent runner
  agentRun: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:run"], request),
  agentCancel: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:cancel"], runId),
  agentActionExecute: (workspaceId, block) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:action-execute"], workspaceId, block),
  onAgentStart: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["agent:start"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["agent:start"], listener);
  },
  onAgentEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["agent:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["agent:event"], listener);
  },
  onAgentDone: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["agent:done"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["agent:done"], listener);
  },
  showAgentRunNotification: (payload) => electron.ipcRenderer.invoke(IPC_CHANNELS["notification:showAgentRun"], payload),
  onOpenAgentRunChat: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["notification:openAgentChat"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["notification:openAgentChat"], listener);
  },
  // Terminal
  terminalCreate: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["terminal:create"], repoPath),
  terminalWrite: (terminalId, data) => electron.ipcRenderer.invoke(IPC_CHANNELS["terminal:write"], terminalId, data),
  terminalResize: (terminalId, cols, rows) => electron.ipcRenderer.invoke(IPC_CHANNELS["terminal:resize"], terminalId, cols, rows),
  terminalDestroy: (terminalId) => electron.ipcRenderer.invoke(IPC_CHANNELS["terminal:destroy"], terminalId),
  onTerminalData: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["terminal:data"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["terminal:data"], listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["terminal:exit"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["terminal:exit"], listener);
  },
  // Conversations
  getConversations: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["conversation:getAll"], workspaceId),
  saveConversation: (conv) => electron.ipcRenderer.invoke(IPC_CHANNELS["conversation:save"], conv),
  deleteConversation: (id, workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["conversation:delete"], id, workspaceId),
  getAgentTabs: async (workspaceId) => {
    try {
      return await electron.ipcRenderer.invoke(IPC_CHANNELS["agentTabs:get"], workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS["agentTabs:get"])) return null;
      throw err;
    }
  },
  saveAgentTabs: async (workspaceId, state) => {
    try {
      await electron.ipcRenderer.invoke(IPC_CHANNELS["agentTabs:save"], workspaceId, state);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS["agentTabs:save"])) return;
      throw err;
    }
  },
  clearAgentTabs: async (workspaceId) => {
    try {
      await electron.ipcRenderer.invoke(IPC_CHANNELS["agentTabs:clear"], workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, IPC_CHANNELS["agentTabs:clear"])) return;
      throw err;
    }
  },
  // Jira OAuth
  jiraStartAuth: (wsId, jiraUrl) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:startAuth"], wsId, jiraUrl),
  jiraDisconnect: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:disconnect"], wsId),
  jiraGetStatus: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:getStatus"], wsId),
  jiraSyncTickets: (wsId, ws) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:syncTickets"], wsId, ws),
  jiraGetProjects: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:getProjects"], wsId),
  jiraGetBoardType: (wsId, projectKey) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:getBoardType"], wsId, projectKey),
  jiraCountTickets: (wsId, projectKey, syncFilter, boardType) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:countTickets"], wsId, projectKey, syncFilter, boardType),
  onJiraAuthComplete: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC_CHANNELS["jira:auth-complete"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["jira:auth-complete"], listener);
  },
  onJiraAuthError: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC_CHANNELS["jira:auth-error"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["jira:auth-error"], listener);
  },
  // Context sync
  pushContext: (workspace, force) => electron.ipcRenderer.invoke(IPC_CHANNELS["context:push"], workspace, force),
  pullContext: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["context:pull"], workspace),
  // Docs
  scanDocs: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:scan"], workspace),
  readDoc: (absolutePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:read"], absolutePath),
  writeDoc: (absolutePath, content) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:write"], absolutePath, content),
  watchDoc: (absolutePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:watch"], absolutePath),
  unwatchDoc: (absolutePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:unwatch"], absolutePath),
  onDocChanged: (cb) => {
    const listener = (_, absolutePath) => cb(absolutePath);
    electron.ipcRenderer.on(IPC_CHANNELS["docs:changed"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["docs:changed"], listener);
  },
  // Artifacts
  artifactListVersions: (workspaceId, artifactPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:listVersions"], workspaceId, artifactPath),
  artifactSaveVersion: (workspaceId, workspace, input) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:saveVersion"], workspaceId, workspace, input),
  artifactListAll: (workspaceId) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:listAll"], workspaceId),
  artifactPullAll: (workspaceId, workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:pullAll"], workspaceId, workspace),
  artifactListContextFiles: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:listContextFiles"], workspace),
  artifactReadFile: (workspace, artifactPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:readFile"], workspace, artifactPath),
  artifactGetFilePath: (workspace, artifactPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:getFilePath"], workspace, artifactPath),
  artifactGetContextTotalBytes: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:getContextTotalBytes"], workspace),
  artifactListContextFilesWithSizes: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["artifact:listContextFilesWithSizes"], workspace),
  // Snapshots
  snapshotTake: (workspaceSlug, runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["snapshot:take"], workspaceSlug, runId),
  snapshotDiff: (workspaceSlug, runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["snapshot:diff"], workspaceSlug, runId),
  snapshotRevert: (workspaceSlug, runId, relativePaths) => electron.ipcRenderer.invoke(IPC_CHANNELS["snapshot:revert"], workspaceSlug, runId, relativePaths),
  snapshotResolve: (workspaceSlug, runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["snapshot:resolve"], workspaceSlug, runId),
  snapshotListPending: (workspaceSlug) => electron.ipcRenderer.invoke(IPC_CHANNELS["snapshot:listPending"], workspaceSlug),
  previewCheck: (workspaceSlug) => electron.ipcRenderer.invoke(IPC_CHANNELS["preview:check"], workspaceSlug),
  previewApply: (previewRoot, workspaceSlug) => electron.ipcRenderer.invoke(IPC_CHANNELS["preview:apply"], previewRoot, workspaceSlug),
  previewApplyFile: (previewRoot, filePath, workspaceSlug) => electron.ipcRenderer.invoke(IPC_CHANNELS["preview:apply-file"], previewRoot, filePath, workspaceSlug),
  previewDiscard: (previewRoot) => electron.ipcRenderer.invoke(IPC_CHANNELS["preview:discard"], previewRoot),
  // MCP Server
  getServerStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS["server:getStatus"]),
  restartServer: () => electron.ipcRenderer.invoke(IPC_CHANNELS["server:restart"]),
  onServerStatusChange: (cb) => {
    const listener = (_, status) => cb(status);
    electron.ipcRenderer.on(IPC_CHANNELS["server:status-change"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["server:status-change"], listener);
  },
  // Onboarding
  nakirosConfigExists: () => electron.ipcRenderer.invoke(IPC_CHANNELS["onboarding:nakirosConfigExists"]),
  onboardingDetectEditors: () => electron.ipcRenderer.invoke(IPC_CHANNELS["onboarding:detectEditors"]),
  onboardingInstall: (editors) => electron.ipcRenderer.invoke(IPC_CHANNELS["onboarding:install"], editors),
  onOnboardingProgress: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["onboarding:progress"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["onboarding:progress"], listener);
  },
  // Updates
  checkForUpdates: (force, channel) => electron.ipcRenderer.invoke(IPC_CHANNELS["updates:check"], force, channel),
  applyUpdate: (files, bundleVersion) => electron.ipcRenderer.invoke(IPC_CHANNELS["updates:apply"], files, bundleVersion),
  getVersionInfo: () => electron.ipcRenderer.invoke(IPC_CHANNELS["updates:getVersionInfo"]),
  onUpdatesAvailable: (cb) => {
    const listener = (_, result) => cb(result);
    electron.ipcRenderer.on(IPC_CHANNELS["updates:available"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["updates:available"], listener);
  },
  onUpdatesProgress: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["updates:progress"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["updates:progress"], listener);
  },
  // Feedback
  sendSessionFeedback: (data) => electron.ipcRenderer.invoke(IPC_CHANNELS["feedback:sendSession"], data),
  sendProductFeedback: (data) => electron.ipcRenderer.invoke(IPC_CHANNELS["feedback:sendProduct"], data),
  // Auth
  authGetState: () => electron.ipcRenderer.invoke(IPC_CHANNELS["auth:getState"]),
  orgGetMine: () => electron.ipcRenderer.invoke(IPC_CHANNELS["org:getMine"]),
  orgListMine: () => electron.ipcRenderer.invoke(IPC_CHANNELS["org:listMine"]),
  orgCreate: (name, slug) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:create"], name, slug),
  orgDelete: (orgId) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:delete"], orgId),
  orgListMembers: (orgId) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:listMembers"], orgId),
  orgAddMember: (orgId, email, role, inviterEmail) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:addMember"], orgId, email, role, inviterEmail),
  orgLeave: (orgId) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:leave"], orgId),
  orgCancelInvitation: (orgId, invitationId) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:cancelInvitation"], orgId, invitationId),
  orgAcceptInvitations: (email) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:acceptInvitations"], email),
  orgRemoveMember: (orgId, userId) => electron.ipcRenderer.invoke(IPC_CHANNELS["org:removeMember"], orgId, userId),
  authSignIn: () => electron.ipcRenderer.invoke(IPC_CHANNELS["auth:signIn"]),
  authSignOut: () => electron.ipcRenderer.invoke(IPC_CHANNELS["auth:signOut"]),
  onAuthComplete: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC_CHANNELS["auth:complete"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["auth:complete"], listener);
  },
  onAuthError: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC_CHANNELS["auth:error"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["auth:error"], listener);
  },
  onAuthSignedOut: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC_CHANNELS["auth:signedOut"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["auth:signedOut"], listener);
  },
  // Artifact sync
  onSyncEvent: (cb) => {
    const listener = (_, event) => cb(event);
    electron.ipcRenderer.on(IPC_CHANNELS["sync:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["sync:event"], listener);
  }
});
