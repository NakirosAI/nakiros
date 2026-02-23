import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import { getAll, save, remove } from './services/workspace.js';
import { detectProfile } from './services/profile-detector.js';
import { syncToRepos } from './services/workspace-sync.js';
import type { StoredWorkspace } from '@tiqora/shared';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle('workspace:getAll', () => getAll());

ipcMain.handle('workspace:save', (_, w: StoredWorkspace) => save(w));

ipcMain.handle('workspace:delete', (_, id: string) => remove(id));

ipcMain.handle('repo:detectProfile', (_, path: string) => detectProfile(path));

ipcMain.handle('workspace:sync', (_, w: StoredWorkspace) => syncToRepos(w));

ipcMain.handle('shell:openPath', (_, path: string) => shell.openPath(path));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
