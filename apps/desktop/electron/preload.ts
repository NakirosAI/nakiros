import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tiqora', {
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  getWorkspaces: () => ipcRenderer.invoke('workspace:getAll'),
  saveWorkspace: (w: unknown) => ipcRenderer.invoke('workspace:save', w),
  deleteWorkspace: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  detectProfile: (path: string) => ipcRenderer.invoke('repo:detectProfile', path),
  syncWorkspace: (w: unknown) => ipcRenderer.invoke('workspace:sync', w),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
});
