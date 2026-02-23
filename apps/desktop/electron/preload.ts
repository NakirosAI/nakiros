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
});
