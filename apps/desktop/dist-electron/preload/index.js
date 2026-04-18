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
  "preview:discard": "preview:discard",
  // Nakiros Agent Team — Project management
  "project:scan": "project:scan",
  "project:scanProgress": "project:scanProgress",
  "project:dismiss": "project:dismiss",
  "project:list": "project:list",
  "project:get": "project:get",
  "project:getStats": "project:getStats",
  "project:getGlobalStats": "project:getGlobalStats",
  "project:listConversations": "project:listConversations",
  "project:getConversation": "project:getConversation",
  "project:getConversationMessages": "project:getConversationMessages",
  "project:listSkills": "project:listSkills",
  "project:getSkill": "project:getSkill",
  "project:saveSkill": "project:saveSkill",
  "project:readSkillFile": "project:readSkillFile",
  "project:saveSkillFile": "project:saveSkillFile",
  "project:getRecommendations": "project:getRecommendations",
  // Nakiros bundled skills
  "nakiros:listBundledSkills": "nakiros:listBundledSkills",
  "nakiros:getBundledSkill": "nakiros:getBundledSkill",
  "nakiros:readBundledSkillFile": "nakiros:readBundledSkillFile",
  "nakiros:saveBundledSkillFile": "nakiros:saveBundledSkillFile",
  "nakiros:promoteBundledSkill": "nakiros:promoteBundledSkill",
  // Unified binary/asset file reader (works across project/nakiros-bundled/claude-global scopes)
  "skill:readFileAsDataUrl": "skill:readFileAsDataUrl",
  // User-global skills (~/.claude/skills/, excluding our symlinks)
  "claudeGlobal:listSkills": "claudeGlobal:listSkills",
  "claudeGlobal:getSkill": "claudeGlobal:getSkill",
  "claudeGlobal:readSkillFile": "claudeGlobal:readSkillFile",
  "claudeGlobal:saveSkillFile": "claudeGlobal:saveSkillFile",
  // Eval runner
  "eval:startRuns": "eval:startRuns",
  "eval:stopRun": "eval:stopRun",
  "eval:listRuns": "eval:listRuns",
  "eval:loadPersisted": "eval:loadPersisted",
  "eval:event": "eval:event",
  "eval:sendUserMessage": "eval:sendUserMessage",
  "eval:finishRun": "eval:finishRun",
  "eval:getFeedback": "eval:getFeedback",
  "eval:saveFeedback": "eval:saveFeedback",
  "eval:listOutputs": "eval:listOutputs",
  "eval:readOutput": "eval:readOutput",
  // Audit runner
  "audit:start": "audit:start",
  "audit:stopRun": "audit:stopRun",
  "audit:getRun": "audit:getRun",
  "audit:sendUserMessage": "audit:sendUserMessage",
  "audit:listHistory": "audit:listHistory",
  "audit:readReport": "audit:readReport",
  "audit:event": "audit:event",
  "audit:listActive": "audit:listActive",
  // Fix runner
  "fix:start": "fix:start",
  "fix:stopRun": "fix:stopRun",
  "fix:getRun": "fix:getRun",
  "fix:sendUserMessage": "fix:sendUserMessage",
  "fix:finish": "fix:finish",
  "fix:event": "fix:event",
  "fix:runEvalsInTemp": "fix:runEvalsInTemp",
  "fix:getBenchmarks": "fix:getBenchmarks",
  "fix:listActive": "fix:listActive",
  "fix:getBufferedEvents": "fix:getBufferedEvents",
  // Create runner — thin mirror of fix:* with different temp-workdir seeding and sync-back policy.
  "create:start": "create:start",
  "create:stopRun": "create:stopRun",
  "create:getRun": "create:getRun",
  "create:sendUserMessage": "create:sendUserMessage",
  "create:finish": "create:finish",
  "create:event": "create:event",
  "create:listActive": "create:listActive",
  "create:getBufferedEvents": "create:getBufferedEvents",
  // Draft files (shared by fix + create — reads from the run's temp workdir)
  "skillAgent:listTempFiles": "skillAgent:listTempFiles",
  "skillAgent:readTempFile": "skillAgent:readTempFile"
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
  agentRun: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["agent:run"], request),
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
  // Artifacts (local only)
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
  // ─── Nakiros Agent Team — Projects ───────────────────────────────────────────
  scanProjects: () => electron.ipcRenderer.invoke(IPC_CHANNELS["project:scan"]),
  listProjects: () => electron.ipcRenderer.invoke(IPC_CHANNELS["project:list"]),
  getProject: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:get"], id),
  dismissProject: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:dismiss"], id),
  listProjectConversations: (projectId) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:listConversations"], projectId),
  getProjectConversationMessages: (projectId, sessionId) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:getConversationMessages"], projectId, sessionId),
  listProjectSkills: (projectId) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:listSkills"], projectId),
  getProjectSkill: (projectId, skillName) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:getSkill"], projectId, skillName),
  saveProjectSkill: (projectId, skillName, content) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:saveSkill"], projectId, skillName, content),
  readSkillFile: (projectId, skillName, relativePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:readSkillFile"], projectId, skillName, relativePath),
  saveSkillFile: (projectId, skillName, relativePath, content) => electron.ipcRenderer.invoke(IPC_CHANNELS["project:saveSkillFile"], projectId, skillName, relativePath, content),
  // Nakiros bundled skills
  listBundledSkills: () => electron.ipcRenderer.invoke(IPC_CHANNELS["nakiros:listBundledSkills"]),
  getBundledSkill: (skillName) => electron.ipcRenderer.invoke(IPC_CHANNELS["nakiros:getBundledSkill"], skillName),
  readBundledSkillFile: (skillName, relativePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["nakiros:readBundledSkillFile"], skillName, relativePath),
  saveBundledSkillFile: (skillName, relativePath, content) => electron.ipcRenderer.invoke(IPC_CHANNELS["nakiros:saveBundledSkillFile"], skillName, relativePath, content),
  promoteBundledSkill: (skillName) => electron.ipcRenderer.invoke(IPC_CHANNELS["nakiros:promoteBundledSkill"], skillName),
  // User-global skills (~/.claude/skills/, excluding our symlinks)
  listClaudeGlobalSkills: () => electron.ipcRenderer.invoke(IPC_CHANNELS["claudeGlobal:listSkills"]),
  getClaudeGlobalSkill: (skillName) => electron.ipcRenderer.invoke(IPC_CHANNELS["claudeGlobal:getSkill"], skillName),
  readClaudeGlobalSkillFile: (skillName, relativePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["claudeGlobal:readSkillFile"], skillName, relativePath),
  readSkillFileAsDataUrl: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["skill:readFileAsDataUrl"], request),
  saveClaudeGlobalSkillFile: (skillName, relativePath, content) => electron.ipcRenderer.invoke(IPC_CHANNELS["claudeGlobal:saveSkillFile"], skillName, relativePath, content),
  onScanProgress: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["project:scanProgress"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["project:scanProgress"], listener);
  },
  // Eval runner
  startEvalRuns: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:startRuns"], request),
  stopEvalRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:stopRun"], runId),
  listEvalRuns: () => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:listRuns"]),
  loadPersistedEvalRuns: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:loadPersisted"], request),
  onEvalEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["eval:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["eval:event"], listener);
  },
  sendEvalUserMessage: (runId, message) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:sendUserMessage"], runId, message),
  finishEvalRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:finishRun"], runId),
  getEvalFeedback: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:getFeedback"], request),
  saveEvalFeedback: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:saveFeedback"], request),
  listEvalRunOutputs: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:listOutputs"], runId),
  readEvalRunOutput: (runId, relativePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["eval:readOutput"], runId, relativePath),
  // Audit
  startAudit: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:start"], request),
  stopAudit: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:stopRun"], runId),
  getAuditRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:getRun"], runId),
  sendAuditUserMessage: (runId, message) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:sendUserMessage"], runId, message),
  listAuditHistory: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:listHistory"], request),
  readAuditReport: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:readReport"], path),
  listActiveAuditRuns: () => electron.ipcRenderer.invoke(IPC_CHANNELS["audit:listActive"]),
  onAuditEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["audit:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["audit:event"], listener);
  },
  // Fix
  startFix: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:start"], request),
  stopFix: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:stopRun"], runId),
  getFixRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:getRun"], runId),
  sendFixUserMessage: (runId, message) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:sendUserMessage"], runId, message),
  finishFix: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:finish"], runId),
  runFixEvalsInTemp: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:runEvalsInTemp"], request),
  getFixBenchmarks: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:getBenchmarks"], runId),
  listActiveFixRuns: () => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:listActive"]),
  getFixBufferedEvents: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["fix:getBufferedEvents"], runId),
  onFixEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["fix:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["fix:event"], listener);
  },
  // Create (skill-factory "create" command)
  startCreate: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:start"], request),
  stopCreate: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:stopRun"], runId),
  getCreateRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:getRun"], runId),
  sendCreateUserMessage: (runId, message) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:sendUserMessage"], runId, message),
  finishCreate: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:finish"], runId),
  listActiveCreateRuns: () => electron.ipcRenderer.invoke(IPC_CHANNELS["create:listActive"]),
  getCreateBufferedEvents: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["create:getBufferedEvents"], runId),
  onCreateEvent: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on(IPC_CHANNELS["create:event"], listener);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS["create:event"], listener);
  },
  // Draft files (shared by fix + create — previews what's in the temp workdir)
  listSkillAgentTempFiles: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS["skillAgent:listTempFiles"], runId),
  readSkillAgentTempFile: (runId, relativePath) => electron.ipcRenderer.invoke(IPC_CHANNELS["skillAgent:readTempFile"], runId, relativePath)
});
