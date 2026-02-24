import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tiqora', {
  // Workspace
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  openFilePicker: () => ipcRenderer.invoke('dialog:openFile'),
  getWorkspaces: () => ipcRenderer.invoke('workspace:getAll'),
  saveWorkspace: (w: unknown) => ipcRenderer.invoke('workspace:save', w),
  deleteWorkspace: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  detectProfile: (path: string) => ipcRenderer.invoke('repo:detectProfile', path),
  syncWorkspace: (w: unknown) => ipcRenderer.invoke('workspace:sync', w),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  gitRemoteUrl: (repoPath: string) => ipcRenderer.invoke('git:remoteUrl', repoPath),
  gitClone: (url: string, parentDir: string) => ipcRenderer.invoke('git:clone', url, parentDir),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  savePreferences: (prefs: unknown) => ipcRenderer.invoke('preferences:save', prefs),
  getAgentInstallStatus: (repoPath: string) => ipcRenderer.invoke('agents:status', repoPath),
  installAgents: (request: unknown) => ipcRenderer.invoke('agents:install', request),

  // Tickets
  getTickets: (wsId: string) => ipcRenderer.invoke('ticket:getAll', wsId),
  saveTicket: (wsId: string, t: unknown) => ipcRenderer.invoke('ticket:save', wsId, t),
  removeTicket: (wsId: string, id: string) => ipcRenderer.invoke('ticket:remove', wsId, id),

  // Epics
  getEpics: (wsId: string) => ipcRenderer.invoke('epic:getAll', wsId),
  saveEpic: (wsId: string, e: unknown) => ipcRenderer.invoke('epic:save', wsId, e),
  removeEpic: (wsId: string, id: string) => ipcRenderer.invoke('epic:remove', wsId, id),

  // Agent context + clipboard
  generateContext: (wsId: string, ticketId: string, ws: unknown) =>
    ipcRenderer.invoke('agent:context', wsId, ticketId, ws),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // Agent runner
  agentRun: (repoPath: string, message: string, sessionId: string | null = null) =>
    ipcRenderer.invoke('agent:run', repoPath, message, sessionId),
  agentCancel: (runId: string) => ipcRenderer.invoke('agent:cancel', runId),
  onAgentStart: (cb: (event: { runId: string; command: string; cwd: string }) => void) => {
    const listener = (_: unknown, payload: { runId: string; command: string; cwd: string }) => cb(payload);
    ipcRenderer.on('agent:start', listener);
    return () => ipcRenderer.removeListener('agent:start', listener);
  },
  onAgentEvent: (cb: (payload: { runId: string; event: unknown }) => void) => {
    const listener = (_: unknown, payload: { runId: string; event: unknown }) => cb(payload);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  onAgentDone: (cb: (event: { runId: string; exitCode: number; error?: string }) => void) => {
    const listener = (_: unknown, payload: { runId: string; exitCode: number; error?: string }) => cb(payload);
    ipcRenderer.on('agent:done', listener);
    return () => ipcRenderer.removeListener('agent:done', listener);
  },

  // Terminal
  terminalCreate: (repoPath: string) => ipcRenderer.invoke('terminal:create', repoPath),
  terminalWrite: (terminalId: string, data: string) =>
    ipcRenderer.invoke('terminal:write', terminalId, data),
  terminalResize: (terminalId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
  terminalDestroy: (terminalId: string) => ipcRenderer.invoke('terminal:destroy', terminalId),
  onTerminalData: (cb: (event: { terminalId: string; data: string }) => void) => {
    const listener = (_: unknown, payload: { terminalId: string; data: string }) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb: (event: { terminalId: string; code: number }) => void) => {
    const listener = (_: unknown, payload: { terminalId: string; code: number }) => cb(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },

  // Conversations
  getConversations: () => ipcRenderer.invoke('conversation:getAll'),
  saveConversation: (conv: unknown) => ipcRenderer.invoke('conversation:save', conv),
  deleteConversation: (id: string) => ipcRenderer.invoke('conversation:delete', id),
  readConversationMessages: (sessionId: string, repoPath: string) =>
    ipcRenderer.invoke('conversation:readMessages', sessionId, repoPath),

  // Jira OAuth
  jiraStartAuth: (wsId: string) => ipcRenderer.invoke('jira:startAuth', wsId),
  jiraDisconnect: (wsId: string) => ipcRenderer.invoke('jira:disconnect', wsId),
  jiraGetStatus: (wsId: string) => ipcRenderer.invoke('jira:getStatus', wsId),
  jiraSyncTickets: (wsId: string, ws: unknown) => ipcRenderer.invoke('jira:syncTickets', wsId, ws),
  jiraGetProjects: (wsId: string) => ipcRenderer.invoke('jira:getProjects', wsId),

  onJiraAuthComplete: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('jira:auth-complete', listener);
    return () => ipcRenderer.removeListener('jira:auth-complete', listener);
  },
  onJiraAuthError: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('jira:auth-error', listener);
    return () => ipcRenderer.removeListener('jira:auth-error', listener);
  },

  // MCP Server
  getServerStatus: () => ipcRenderer.invoke('server:getStatus'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  onServerStatusChange: (cb: (status: 'starting' | 'running' | 'stopped') => void) => {
    const listener = (_: unknown, status: 'starting' | 'running' | 'stopped') => cb(status);
    ipcRenderer.on('server:status-change', listener);
    return () => ipcRenderer.removeListener('server:status-change', listener);
  },
});
