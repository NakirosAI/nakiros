import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const execFileAsync = promisify(execFile);
import { startServer, stopServer } from '@tiqora/server';
import { DEFAULT_MCP_SERVER_URL } from '@tiqora/shared';
import { getAll, save, remove } from './services/workspace.js';
import { syncWorkspaceYaml } from './services/workspace-yaml.js';
import { resetWorkspace } from './services/workspace-reset.js';
import { detectProfile } from './services/profile-detector.js';
import { syncToRepos } from './services/workspace-sync.js';
import { createWorkspaceRoot, copyRepoToDirectory, initGitRepo } from './services/workspace-bootstrap.js';
import { scanWorkspaceDocs } from './services/doc-scanner.js';
import { getPreferences, savePreferences } from './services/preferences.js';
import { getAgentInstallStatus, getGlobalInstallStatus, installAgents, installAgentsGlobally } from './services/agent-installer.js';
import { getAgentCliStatus } from './services/agent-cli.js';
import {
  getTickets, saveTicket, removeTicket,
  getEpics, saveEpic, removeEpic,
} from './services/ticket-storage.js';
import { generateContext } from './services/agent-context.js';
import { createTerminal, writeToTerminal, resizeTerminal, destroyTerminal } from './services/terminal.js';
import { runAgentCommand, cancelAgentRun } from './services/agent-runner.js';
import { getConversations, saveConversation, deleteConversation } from './services/conversation-store.js';
import { getAgentTabsState, saveAgentTabsState, clearAgentTabsState } from './services/agent-tabs-store.js';
import { readClaudeHistory } from './services/claude-history.js';
import { readCodexHistory } from './services/codex-history.js';
import {
  generatePKCE,
  generateState,
  openAuthUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getJiraUserInfo,
} from './services/jira-oauth.js';
import {
  saveTokens,
  clearTokens,
  getTokenMeta,
  loadTokens,
  getValidAccessToken,
} from './services/jira-token-store.js';
import { syncJiraTickets } from './services/jira-sync.js';
import { fetchProjects } from './services/jira-connector.js';
import type {
  StoredWorkspace,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentInstallRequest,
  AgentProvider,
} from '@tiqora/shared';

// ─── Single-instance lock (required for protocol handling on Windows/Linux) ───

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ─── Protocol registration ────────────────────────────────────────────────────

if (process.defaultApp) {
  // Development mode: register with explicit executable path
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('tiqora', process.execPath, [resolve(process.argv[1] ?? '')]);
  }
} else {
  app.setAsDefaultProtocolClient('tiqora');
}

// ─── OAuth state store ────────────────────────────────────────────────────────

interface PendingOAuth {
  codeVerifier: string;
  wsId: string;
}

const pendingOAuth = new Map<string, PendingOAuth>();

async function handleOAuthCallback(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== 'tiqora:') return;
  if (parsed.hostname !== 'oauth') return;

  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;

  // Bring window to front
  if (win.isMinimized()) win.restore();
  win.focus();

  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const errorParam = parsed.searchParams.get('error');

  if (errorParam || !code || !state) {
    win.webContents.send('jira:auth-error', {
      wsId: '',
      error: errorParam ?? 'Missing code or state in OAuth callback',
    });
    return;
  }

  const pending = pendingOAuth.get(state);
  if (!pending) {
    win.webContents.send('jira:auth-error', { wsId: '', error: 'Invalid OAuth state (expired or unknown)' });
    return;
  }
  pendingOAuth.delete(state);

  const { codeVerifier, wsId } = pending;

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    const resources = await getAccessibleResources(tokens.access_token);

    if (resources.length === 0) {
      throw new Error('No accessible Jira sites found. Make sure you have access to at least one Jira Cloud instance.');
    }

    // Try to match configured jiraUrl, otherwise use first resource
    const workspaces = getAll();
    const workspace = workspaces.find((w) => w.id === wsId);

    let resource = resources[0]!;
    if (workspace?.jiraUrl && resources.length > 1) {
      const normalizedConfigured = workspace.jiraUrl.replace(/\/$/, '').toLowerCase();
      const match = resources.find((r) => r.url.replace(/\/$/, '').toLowerCase() === normalizedConfigured);
      if (match) resource = match;
    }

    const { displayName } = await getJiraUserInfo(tokens.access_token, resource.id);

    saveTokens(wsId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      cloudId: resource.id,
      cloudUrl: resource.url,
      displayName,
    });

    // Update workspace with connection info
    if (workspace) {
      const updated: StoredWorkspace = {
        ...workspace,
        jiraConnected: true,
        jiraCloudId: resource.id,
        jiraCloudUrl: resource.url,
        jiraUrl: workspace.jiraUrl ?? resource.url,
      };
      save(updated);
      win.webContents.send('jira:auth-complete', {
        wsId,
        cloudUrl: resource.url,
        displayName,
        workspace: updated,
      });
    } else {
      win.webContents.send('jira:auth-complete', { wsId, cloudUrl: resource.url, displayName });
    }
  } catch (err) {
    win.webContents.send('jira:auth-error', { wsId, error: String(err) });
  }
}

// ─── Icon loader ──────────────────────────────────────────────────────────────

function loadAppIcon() {
  const candidates = [
    join(process.resourcesPath, 'icon.svg'),
    join(__dirname, '../../src/assets/icon.svg'),
    join(__dirname, '../../icon.svg'),
    join(process.cwd(), 'apps/desktop/src/assets/icon.svg'),
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

// ─── macOS: open-url event (protocol handler) ─────────────────────────────────

// Buffer URL if it arrives before the app is ready
let pendingProtocolUrl: string | null = null;

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (app.isReady()) {
    void handleOAuthCallback(url);
  } else {
    pendingProtocolUrl = url;
  }
});

// ─── Windows/Linux: second-instance (single-instance lock) ───────────────────

app.on('second-instance', (_, argv) => {
  const url = argv.find((arg) => arg.startsWith('tiqora://'));
  if (url) void handleOAuthCallback(url);

  // Focus existing window
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ─── IPC: Workspace ───────────────────────────────────────────────────────────

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
ipcMain.handle('workspace:createRoot', (_, parentDir: string, workspaceName: string) =>
  createWorkspaceRoot(parentDir, workspaceName));
ipcMain.handle('repo:detectProfile', (_, path: string) => detectProfile(path));
ipcMain.handle('repo:copyLocal', (_, sourcePath: string, targetParentDir: string) =>
  copyRepoToDirectory(sourcePath, targetParentDir));
ipcMain.handle('workspace:syncYaml', (_, w: StoredWorkspace) => syncWorkspaceYaml(w));
ipcMain.handle('workspace:reset', (_, w: StoredWorkspace) => resetWorkspace(w));
ipcMain.handle('workspace:sync', (_, w: StoredWorkspace) => {
  const prefs = getPreferences();
  syncToRepos(w, prefs.mcpServerUrl || DEFAULT_MCP_SERVER_URL);
});
ipcMain.handle('docs:scan', (_, w: StoredWorkspace) => scanWorkspaceDocs(w));
ipcMain.handle('docs:read', (_, absolutePath: string) => readFileSync(absolutePath, 'utf-8'));
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
    mkdirSync(parentDir, { recursive: true });
    await execFileAsync('git', ['clone', url], { cwd: parentDir });
    const repoName = url.split('/').pop()?.replace(/\.git$/, '') ?? 'repo';
    return { success: true, repoPath: join(parentDir, repoName), repoName };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, repoPath: '', repoName: '', error };
  }
});
ipcMain.handle('git:init', async (_, repoPath: string) => {
  try {
    await initGitRepo(repoPath);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
});
ipcMain.handle('preferences:get', () => getPreferences());
ipcMain.handle('preferences:save', (_, prefs: AppPreferences) => savePreferences(prefs));
ipcMain.handle('agents:status', (_, repoPath: string) => getAgentInstallStatus(repoPath));
ipcMain.handle('agents:install', (_, request: AgentInstallRequest) => installAgents(request));
ipcMain.handle('agents:global-status', () => getGlobalInstallStatus());
ipcMain.handle('agents:install-global', () => installAgentsGlobally());
ipcMain.handle('agents:cli-status', () => getAgentCliStatus());

// ─── IPC: Tickets ─────────────────────────────────────────────────────────────

ipcMain.handle('ticket:getAll', (_, wsId: string) => getTickets(wsId));
ipcMain.handle('ticket:save', (_, wsId: string, t: LocalTicket) => saveTicket(wsId, t));
ipcMain.handle('ticket:remove', (_, wsId: string, id: string) => removeTicket(wsId, id));

// ─── IPC: Epics ───────────────────────────────────────────────────────────────

ipcMain.handle('epic:getAll', (_, wsId: string) => getEpics(wsId));
ipcMain.handle('epic:save', (_, wsId: string, e: LocalEpic) => saveEpic(wsId, e));
ipcMain.handle('epic:remove', (_, wsId: string, id: string) => removeEpic(wsId, id));

// ─── IPC: Agent context + clipboard ──────────────────────────────────────────

ipcMain.handle('agent:context', (_, wsId: string, ticketId: string, ws: StoredWorkspace) =>
  generateContext(wsId, ticketId, ws));
ipcMain.handle('clipboard:write', (_, text: string) => clipboard.writeText(text));

// ─── IPC: Terminal (node-pty) ─────────────────────────────────────────────────

ipcMain.handle('terminal:create', (event, repoPath: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const terminalId = createTerminal(
    repoPath,
    (data) => win?.webContents.send('terminal:data', { terminalId, data }),
    (code) => win?.webContents.send('terminal:exit', { terminalId, code }),
  );
  return terminalId;
});

ipcMain.handle('terminal:write', (_, terminalId: string, data: string) => {
  writeToTerminal(terminalId, data);
});

ipcMain.handle('terminal:resize', (_, terminalId: string, cols: number, rows: number) => {
  resizeTerminal(terminalId, cols, rows);
});

ipcMain.handle('terminal:destroy', (_, terminalId: string) => {
  destroyTerminal(terminalId);
});

// ─── IPC: Agent runner (provider: claude/codex/cursor) ───────────────────────

ipcMain.handle(
  'agent:run',
  (
    event,
    repoPath: string,
    message: string,
    sessionId: string | null,
    additionalDirs?: string[],
    requestedProvider?: AgentProvider,
  ) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const prefs = getPreferences();
  const provider = (
    requestedProvider === 'claude'
    || requestedProvider === 'codex'
    || requestedProvider === 'cursor'
  )
    ? requestedProvider
    : (prefs.agentProvider ?? 'claude');
  // Use `let` + capture in onStart to avoid TDZ: onDone can fire synchronously
  // (e.g. spawn error) before the `const runId = ...` assignment completes.
  let runId = '';
  runId = runAgentCommand(
    provider,
    repoPath,
    message,
    sessionId ?? null,
    (info) => {
      runId = info.runId;
      win?.webContents.send('agent:start', info);
    },
    (evt) => win?.webContents.send('agent:event', { runId, event: evt }),
    (exitCode, error) => win?.webContents.send('agent:done', { runId, exitCode, error }),
    additionalDirs,
  );
  return runId;
});

ipcMain.handle('agent:cancel', (_, runId: string) => {
  cancelAgentRun(runId);
});

// ─── IPC: Conversations ───────────────────────────────────────────────────────

ipcMain.handle('conversation:getAll', () => getConversations());
ipcMain.handle('conversation:save', (_, conv: unknown) => saveConversation(conv as Parameters<typeof saveConversation>[0]));
ipcMain.handle('conversation:delete', (_, id: string) => deleteConversation(id));
ipcMain.handle(
  'conversation:readMessages',
  (_, sessionId: string, repoPath: string, provider?: AgentProvider) => {
    if (provider === 'codex') return readCodexHistory(sessionId);
    if (provider === 'claude') return readClaudeHistory(sessionId, repoPath);
    return [];
  },
);

// ─── IPC: Agent tabs (multi-conversations state) ────────────────────────────

ipcMain.handle('agentTabs:get', (_, workspaceId: string) => getAgentTabsState(workspaceId));
ipcMain.handle('agentTabs:save', (_, workspaceId: string, state: unknown) =>
  saveAgentTabsState(workspaceId, state as Parameters<typeof saveAgentTabsState>[1]));
ipcMain.handle('agentTabs:clear', (_, workspaceId: string) => clearAgentTabsState(workspaceId));

// ─── IPC: Jira OAuth ─────────────────────────────────────────────────────────

ipcMain.handle('jira:startAuth', (_, wsId: string) => {
  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePKCE();
  pendingOAuth.set(state, { codeVerifier, wsId });
  openAuthUrl(state, codeChallenge);
});

ipcMain.handle('jira:disconnect', (_, wsId: string) => {
  clearTokens(wsId);
  const workspaces = getAll();
  const workspace = workspaces.find((w) => w.id === wsId);
  if (workspace) {
    const updated: StoredWorkspace = {
      ...workspace,
      jiraConnected: false,
      jiraCloudId: undefined,
      jiraCloudUrl: undefined,
    };
    save(updated);
    return updated;
  }
  return null;
});

ipcMain.handle('jira:getStatus', (_, wsId: string) => getTokenMeta(wsId));

ipcMain.handle('jira:syncTickets', async (_, wsId: string, workspace: StoredWorkspace) => {
  // Ensure we use the persisted cloudId (workspace from renderer may be stale)
  const persisted = getAll().find((w) => w.id === wsId) ?? workspace;
  return syncJiraTickets(wsId, persisted);
});

ipcMain.handle('jira:getValidToken', (_, wsId: string) => getValidAccessToken(wsId));

ipcMain.handle('jira:getProjects', async (_, wsId: string) => {
  const token = await getValidAccessToken(wsId);
  const workspace = getAll().find((w) => w.id === wsId);
  const cloudId = workspace?.jiraCloudId ?? loadTokens(wsId)?.cloudId;
  if (!cloudId) throw new Error('Not connected to Jira');
  return fetchProjects(token, cloudId);
});


// ─── MCP Server ───────────────────────────────────────────────────────────────

type McpServerStatus = 'starting' | 'running' | 'stopped';

function broadcastServerStatus(status: McpServerStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('server:status-change', status);
  }
}

ipcMain.handle('server:getStatus', async () => {
  const prefs = getPreferences();
  const baseUrl = prefs.mcpServerUrl || DEFAULT_MCP_SERVER_URL;
  try {
    const res = await fetch(`${baseUrl}/status`);
    return res.ok ? 'running' : 'stopped';
  } catch {
    return 'stopped';
  }
});

ipcMain.handle('server:restart', async () => {
  broadcastServerStatus('starting');
  stopServer();
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  try {
    await startServer(3737);
    broadcastServerStatus('running');
  } catch (err) {
    broadcastServerStatus('stopped');
    console.error('[Tiqora] Failed to restart MCP server:', (err as Error).message);
  }
});

async function ensureMcpServer(port: number): Promise<void> {
  broadcastServerStatus('starting');

  try {
    const res = await fetch(`http://localhost:${port}/status`);
    if (res.ok) {
      console.log(`[Tiqora] MCP server already running on http://localhost:${port}`);
      broadcastServerStatus('running');
      return;
    }
  } catch {
    // Nothing running on that port — start our own
  }

  try {
    await startServer(port);
    broadcastServerStatus('running');
    console.log(`[Tiqora] MCP server running on http://localhost:${port}`);
  } catch (err) {
    broadcastServerStatus('stopped');
    console.error('[Tiqora] Failed to start MCP server:', (err as Error).message);
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  void ensureMcpServer(3737);

  // Process any URL that arrived before the app was ready (macOS)
  if (pendingProtocolUrl) {
    const urlToProcess = pendingProtocolUrl;
    pendingProtocolUrl = null;
    // Wait for the renderer to load before sending events
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.once('did-finish-load', () => {
        void handleOAuthCallback(urlToProcess);
      });
    }
  }
});

app.on('before-quit', () => {
  broadcastServerStatus('stopped');
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  const existing = BrowserWindow.getAllWindows();
  if (existing.length === 0) {
    createWindow();
    return;
  }
  const win = existing[0];
  if (win?.isMinimized()) win.restore();
  win?.show();
  win?.focus();
});
