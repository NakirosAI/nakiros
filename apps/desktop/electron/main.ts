import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);
import { getAll, save, remove } from './services/workspace.js';
import { detectProfile } from './services/profile-detector.js';
import { syncToRepos } from './services/workspace-sync.js';
import { getPreferences, savePreferences } from './services/preferences.js';
import { getAgentInstallStatus, installAgents } from './services/agent-installer.js';
import {
  getTickets, saveTicket, removeTicket,
  getEpics, saveEpic, removeEpic,
} from './services/ticket-storage.js';
import { generateContext } from './services/agent-context.js';
import type {
  StoredWorkspace,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentInstallRequest,
} from '@tiqora/shared';

function loadAppIcon() {
  const candidates = [
    join(__dirname, '../../icon.svg'),
    join(process.cwd(), 'icon.svg'),
  ];

  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) continue;
    const svgContent = readFileSync(iconPath, 'utf8');
    const base64 = Buffer.from(svgContent).toString('base64');
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
    if (!icon.isEmpty()) return icon;
  }

  return undefined;
}

function createWindow(): void {
  const appIcon = loadAppIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin' && appIcon) {
    app.dock.setIcon(appIcon);
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Workspace
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('workspace:getAll', () => getAll());
ipcMain.handle('workspace:save', (_, w: StoredWorkspace) => save(w));
ipcMain.handle('workspace:delete', (_, id: string) => remove(id));
ipcMain.handle('repo:detectProfile', (_, path: string) => detectProfile(path));
ipcMain.handle('workspace:sync', (_, w: StoredWorkspace) => syncToRepos(w));
ipcMain.handle('shell:openPath', (_, path: string) => shell.openPath(path));
ipcMain.handle('git:remoteUrl', async (_, repoPath: string) => {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
});
ipcMain.handle('git:clone', async (_, url: string, parentDir: string) => {
  try {
    await execFileAsync('git', ['clone', url], { cwd: parentDir });
    const repoName = url.split('/').pop()?.replace(/\.git$/, '') ?? 'repo';
    return { success: true, repoPath: join(parentDir, repoName), repoName };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, repoPath: '', repoName: '', error };
  }
});
ipcMain.handle('preferences:get', () => getPreferences());
ipcMain.handle('preferences:save', (_, prefs: AppPreferences) => savePreferences(prefs));
ipcMain.handle('agents:status', (_, repoPath: string) => getAgentInstallStatus(repoPath));
ipcMain.handle('agents:install', (_, request: AgentInstallRequest) => installAgents(request));

// Tickets
ipcMain.handle('ticket:getAll', (_, wsId: string) => getTickets(wsId));
ipcMain.handle('ticket:save', (_, wsId: string, t: LocalTicket) => saveTicket(wsId, t));
ipcMain.handle('ticket:remove', (_, wsId: string, id: string) => removeTicket(wsId, id));

// Epics
ipcMain.handle('epic:getAll', (_, wsId: string) => getEpics(wsId));
ipcMain.handle('epic:save', (_, wsId: string, e: LocalEpic) => saveEpic(wsId, e));
ipcMain.handle('epic:remove', (_, wsId: string, id: string) => removeEpic(wsId, id));

// Agent context + clipboard
ipcMain.handle('agent:context', (_, wsId: string, ticketId: string, ws: StoredWorkspace) =>
  generateContext(wsId, ticketId, ws));
ipcMain.handle('clipboard:write', (_, text: string) => clipboard.writeText(text));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
