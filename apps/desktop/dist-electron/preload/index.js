"use strict";
const electron = require("electron");
function isMissingHandlerError(err, channel) {
  if (!(err instanceof Error)) return false;
  return err.message.includes(`No handler registered for '${channel}'`);
}
electron.contextBridge.exposeInMainWorld("nakiros", {
  // Workspace
  selectDirectory: () => electron.ipcRenderer.invoke("dialog:selectDirectory"),
  openFilePicker: () => electron.ipcRenderer.invoke("dialog:openFile"),
  getWorkspaces: () => electron.ipcRenderer.invoke("workspace:getAll"),
  saveWorkspace: (w) => electron.ipcRenderer.invoke("workspace:save", w),
  deleteWorkspace: (id) => electron.ipcRenderer.invoke("workspace:delete", id),
  createWorkspaceRoot: (parentDir, workspaceName) => electron.ipcRenderer.invoke("workspace:createRoot", parentDir, workspaceName),
  detectProfile: (path) => electron.ipcRenderer.invoke("repo:detectProfile", path),
  copyLocalRepo: (sourcePath, targetParentDir) => electron.ipcRenderer.invoke("repo:copyLocal", sourcePath, targetParentDir),
  syncWorkspace: (w) => electron.ipcRenderer.invoke("workspace:sync", w),
  syncWorkspaceYaml: (w) => electron.ipcRenderer.invoke("workspace:syncYaml", w),
  resetWorkspace: (w) => electron.ipcRenderer.invoke("workspace:reset", w),
  openPath: (path) => electron.ipcRenderer.invoke("shell:openPath", path),
  gitRemoteUrl: (repoPath) => electron.ipcRenderer.invoke("git:remoteUrl", repoPath),
  gitClone: (url, parentDir) => electron.ipcRenderer.invoke("git:clone", url, parentDir),
  gitInit: (repoPath) => electron.ipcRenderer.invoke("git:init", repoPath),
  getPreferences: () => electron.ipcRenderer.invoke("preferences:get"),
  savePreferences: (prefs) => electron.ipcRenderer.invoke("preferences:save", prefs),
  getAgentInstallStatus: (repoPath) => electron.ipcRenderer.invoke("agents:status", repoPath),
  installAgents: (request) => electron.ipcRenderer.invoke("agents:install", request),
  getGlobalInstallStatus: () => electron.ipcRenderer.invoke("agents:global-status"),
  installAgentsGlobal: () => electron.ipcRenderer.invoke("agents:install-global"),
  getAgentCliStatus: () => electron.ipcRenderer.invoke("agents:cli-status"),
  // Tickets
  getTickets: (wsId) => electron.ipcRenderer.invoke("ticket:getAll", wsId),
  saveTicket: (wsId, t) => electron.ipcRenderer.invoke("ticket:save", wsId, t),
  removeTicket: (wsId, id) => electron.ipcRenderer.invoke("ticket:remove", wsId, id),
  // Epics
  getEpics: (wsId) => electron.ipcRenderer.invoke("epic:getAll", wsId),
  saveEpic: (wsId, e) => electron.ipcRenderer.invoke("epic:save", wsId, e),
  removeEpic: (wsId, id) => electron.ipcRenderer.invoke("epic:remove", wsId, id),
  // Agent context + clipboard
  generateContext: (wsId, ticketId, ws) => electron.ipcRenderer.invoke("agent:context", wsId, ticketId, ws),
  writeClipboard: (text) => electron.ipcRenderer.invoke("clipboard:write", text),
  // Agent runner
  agentRun: (repoPath, message, sessionId = null, additionalDirs, provider) => electron.ipcRenderer.invoke("agent:run", repoPath, message, sessionId, additionalDirs, provider),
  agentCancel: (runId) => electron.ipcRenderer.invoke("agent:cancel", runId),
  onAgentStart: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("agent:start", listener);
    return () => electron.ipcRenderer.removeListener("agent:start", listener);
  },
  onAgentEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("agent:event", listener);
    return () => electron.ipcRenderer.removeListener("agent:event", listener);
  },
  onAgentDone: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("agent:done", listener);
    return () => electron.ipcRenderer.removeListener("agent:done", listener);
  },
  // Terminal
  terminalCreate: (repoPath) => electron.ipcRenderer.invoke("terminal:create", repoPath),
  terminalWrite: (terminalId, data) => electron.ipcRenderer.invoke("terminal:write", terminalId, data),
  terminalResize: (terminalId, cols, rows) => electron.ipcRenderer.invoke("terminal:resize", terminalId, cols, rows),
  terminalDestroy: (terminalId) => electron.ipcRenderer.invoke("terminal:destroy", terminalId),
  onTerminalData: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("terminal:data", listener);
    return () => electron.ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("terminal:exit", listener);
    return () => electron.ipcRenderer.removeListener("terminal:exit", listener);
  },
  // Conversations
  getConversations: (workspaceId) => electron.ipcRenderer.invoke("conversation:getAll", workspaceId),
  saveConversation: (conv) => electron.ipcRenderer.invoke("conversation:save", conv),
  deleteConversation: (id, workspaceId) => electron.ipcRenderer.invoke("conversation:delete", id, workspaceId),
  getAgentTabs: async (workspaceId) => {
    try {
      return await electron.ipcRenderer.invoke("agentTabs:get", workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, "agentTabs:get")) return null;
      throw err;
    }
  },
  saveAgentTabs: async (workspaceId, state) => {
    try {
      await electron.ipcRenderer.invoke("agentTabs:save", workspaceId, state);
    } catch (err) {
      if (isMissingHandlerError(err, "agentTabs:save")) return;
      throw err;
    }
  },
  clearAgentTabs: async (workspaceId) => {
    try {
      await electron.ipcRenderer.invoke("agentTabs:clear", workspaceId);
    } catch (err) {
      if (isMissingHandlerError(err, "agentTabs:clear")) return;
      throw err;
    }
  },
  // Jira OAuth
  jiraStartAuth: (wsId) => electron.ipcRenderer.invoke("jira:startAuth", wsId),
  jiraDisconnect: (wsId) => electron.ipcRenderer.invoke("jira:disconnect", wsId),
  jiraGetStatus: (wsId) => electron.ipcRenderer.invoke("jira:getStatus", wsId),
  jiraSyncTickets: (wsId, ws) => electron.ipcRenderer.invoke("jira:syncTickets", wsId, ws),
  jiraGetProjects: (wsId) => electron.ipcRenderer.invoke("jira:getProjects", wsId),
  jiraGetBoardType: (wsId, projectKey) => electron.ipcRenderer.invoke("jira:getBoardType", wsId, projectKey),
  jiraCountTickets: (wsId, projectKey, syncFilter, boardType) => electron.ipcRenderer.invoke("jira:countTickets", wsId, projectKey, syncFilter, boardType),
  onJiraAuthComplete: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on("jira:auth-complete", listener);
    return () => electron.ipcRenderer.removeListener("jira:auth-complete", listener);
  },
  onJiraAuthError: (cb) => {
    const listener = (_, data) => cb(data);
    electron.ipcRenderer.on("jira:auth-error", listener);
    return () => electron.ipcRenderer.removeListener("jira:auth-error", listener);
  },
  // Docs
  scanDocs: (workspace) => electron.ipcRenderer.invoke("docs:scan", workspace),
  readDoc: (absolutePath) => electron.ipcRenderer.invoke("docs:read", absolutePath),
  // MCP Server
  getServerStatus: () => electron.ipcRenderer.invoke("server:getStatus"),
  restartServer: () => electron.ipcRenderer.invoke("server:restart"),
  onServerStatusChange: (cb) => {
    const listener = (_, status) => cb(status);
    electron.ipcRenderer.on("server:status-change", listener);
    return () => electron.ipcRenderer.removeListener("server:status-change", listener);
  },
  // Onboarding
  nakirosConfigExists: () => electron.ipcRenderer.invoke("onboarding:nakirosConfigExists"),
  onboardingDetectEditors: () => electron.ipcRenderer.invoke("onboarding:detectEditors"),
  onboardingInstall: (editors) => electron.ipcRenderer.invoke("onboarding:install", editors),
  onOnboardingProgress: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("onboarding:progress", listener);
    return () => electron.ipcRenderer.removeListener("onboarding:progress", listener);
  },
  // Updates
  checkForUpdates: (force) => electron.ipcRenderer.invoke("updates:check", force),
  applyUpdate: (files) => electron.ipcRenderer.invoke("updates:apply", files),
  onUpdatesAvailable: (cb) => {
    const listener = (_, result) => cb(result);
    electron.ipcRenderer.on("updates:available", listener);
    return () => electron.ipcRenderer.removeListener("updates:available", listener);
  },
  onUpdatesProgress: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("updates:progress", listener);
    return () => electron.ipcRenderer.removeListener("updates:progress", listener);
  }
});
