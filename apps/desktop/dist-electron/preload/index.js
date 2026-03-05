"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
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
  "docs:read": "docs:read",
  "docs:scan": "docs:scan",
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
  "jira:getValidToken": "jira:getValidToken",
  "jira:startAuth": "jira:startAuth",
  "jira:syncTickets": "jira:syncTickets",
  "notification:openAgentChat": "notification:openAgentChat",
  "notification:showAgentRun": "notification:showAgentRun",
  "onboarding:detectEditors": "onboarding:detectEditors",
  "onboarding:install": "onboarding:install",
  "onboarding:nakirosConfigExists": "onboarding:nakirosConfigExists",
  "onboarding:progress": "onboarding:progress",
  "preferences:get": "preferences:get",
  "preferences:save": "preferences:save",
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
  "workspace:createRoot": "workspace:createRoot",
  "workspace:delete": "workspace:delete",
  "workspace:getAll": "workspace:getAll",
  "workspace:reset": "workspace:reset",
  "workspace:save": "workspace:save",
  "workspace:sync": "workspace:sync",
  "workspace:syncYaml": "workspace:syncYaml"
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
  saveWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:save"], w),
  deleteWorkspace: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:delete"], id),
  createWorkspaceRoot: (parentDir, workspaceName) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:createRoot"], parentDir, workspaceName),
  detectProfile: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS["repo:detectProfile"], path),
  copyLocalRepo: (sourcePath, targetParentDir) => electron.ipcRenderer.invoke(IPC_CHANNELS["repo:copyLocal"], sourcePath, targetParentDir),
  syncWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:sync"], w),
  syncWorkspaceYaml: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:syncYaml"], w),
  resetWorkspace: (w) => electron.ipcRenderer.invoke(IPC_CHANNELS["workspace:reset"], w),
  openPath: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS["shell:openPath"], path),
  gitRemoteUrl: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:remoteUrl"], repoPath),
  gitClone: (url, parentDir) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:clone"], url, parentDir),
  gitInit: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["git:init"], repoPath),
  getPreferences: () => electron.ipcRenderer.invoke(IPC_CHANNELS["preferences:get"]),
  savePreferences: (prefs) => electron.ipcRenderer.invoke(IPC_CHANNELS["preferences:save"], prefs),
  getAgentInstallStatus: (repoPath) => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:status"], repoPath),
  installAgents: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:install"], request),
  getGlobalInstallStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:global-status"]),
  getInstalledCommands: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:installed-commands"]),
  installAgentsGlobal: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:install-global"]),
  getAgentCliStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS["agents:cli-status"]),
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
  agentRun: (repoPath, message, sessionId = null, additionalDirs, provider) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:run"], repoPath, message, sessionId, additionalDirs, provider),
  agentCancel: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:cancel"], runId),
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
  jiraStartAuth: (wsId) => electron.ipcRenderer.invoke(IPC_CHANNELS["jira:startAuth"], wsId),
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
  // Docs
  scanDocs: (workspace) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:scan"], workspace),
  readDoc: (absolutePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["docs:read"], absolutePath),
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
  sendProductFeedback: (data) => electron.ipcRenderer.invoke(IPC_CHANNELS["feedback:sendProduct"], data)
});
