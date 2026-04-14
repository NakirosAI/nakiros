import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Notification } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { homedir } from 'os';
import { join, resolve } from 'path';

const execFileAsync = promisify(execFile);
import { startServer, stopServer } from '@nakiros/server';
import { DEFAULT_MCP_SERVER_URL, IPC_CHANNELS } from '@nakiros/shared';
import { getAll, save, remove, getNakirosWorkspaceDir, resolveWorkspaceSlug } from './services/workspace.js';
import { syncWorkspaceSymlinks } from './services/workspace-symlinks.js';
import { syncWorkspaceYaml } from './services/workspace-yaml.js';
import { resetWorkspace } from './services/workspace-reset.js';
import { detectProfile } from './services/profile-detector.js';
import { syncToRepos } from './services/workspace-sync.js';
import { createWorkspaceRoot, copyRepoToDirectory, initGitRepo } from './services/workspace-bootstrap.js';
import { scanWorkspaceDocs } from './services/doc-scanner.js';
import { getPreferences, savePreferences } from './services/preferences.js';
import {
  getAgentInstallStatus,
  getGlobalInstallStatus,
  getInstalledCommands,
  installAgents,
  installAgentsGlobally,
  ensureCommandsInRepo,
} from './services/agent-installer.js';
import { detectEditors, nakirosConfigExists, installNakiros } from './services/onboarding-installer.js';
import { getAgentCliStatus } from './services/agent-cli.js';
import {
  getTickets, saveTicket, removeTicket,
  getEpics, saveEpic, removeEpic,
  toWorkspaceSlug,
} from './services/ticket-storage.js';
import { getGettingStartedContext, saveGettingStartedState } from './services/getting-started-state.js';
import { generateContext } from './services/agent-context.js';
import { createTerminal, writeToTerminal, resizeTerminal, destroyTerminal } from './services/terminal.js';
import { runAgentCommand, cancelAgentRun, resolveAgentCwd } from './services/agent-runner-bridge.js';
import { getConversations, deleteConversationEntry } from './services/conversation-reader.js';
import {
  readArtifactFile,
  listContextArtifactFiles,
  listContextArtifactFilesWithSizes,
  getArtifactFilePath,
  getContextArtifactTotalBytes,
} from './services/artifact-service.js';
import {
  takeSnapshot,
  diffSnapshot,
  revertSnapshot,
  resolveSnapshot,
  listPendingSnapshots,
} from './services/snapshot-service.js';
import { checkPendingPreview, applyPreview, applyPreviewFile, discardPreview } from './services/preview-service.js';
import { getAgentTabsState, saveAgentTabsState, clearAgentTabsState } from './services/agent-tabs-store.js';
import {
  generatePKCE,
  generateState,
  openAuthUrl,
} from './services/jira-oauth.js';
import {
  completeJiraOAuth,
  countJiraTickets,
  disconnectJira,
  getJiraBoardSelection,
  getJiraProjects,
  getJiraStatus,
  syncWorkspaceJiraTickets,
} from './services/jira-auth-service.js';
import type {
  AgentRunRequest,
  StoredWorkspace,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentInstallRequest,
  AgentProvider,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraSyncFilter,
  StoredAgentTabsState,
} from '@nakiros/shared';

// ─── Single-instance lock (required for protocol handling on Windows/Linux) ───

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
let isQuitting = false;

// ─── Protocol registration ────────────────────────────────────────────────────

if (process.defaultApp) {
  // Development mode: register with explicit executable path
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nakiros', process.execPath, [resolve(process.argv[1] ?? '')]);
  }
} else {
  app.setAsDefaultProtocolClient('nakiros');
}

// ─── OAuth state store ────────────────────────────────────────────────────────

interface PendingOAuth {
  codeVerifier: string;
  wsId: string;
  jiraUrl?: string;
}

const pendingOAuth = new Map<string, PendingOAuth>();

async function handleOAuthCallback(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== 'nakiros:') return;

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  // ── Jira OAuth callback ───────────────────────────────────────────────
  if (parsed.hostname !== 'oauth') return;

  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const errorParam = parsed.searchParams.get('error');

  if (errorParam || !code || !state) {
    win.webContents.send(IPC_CHANNELS['jira:auth-error'], {
      wsId: '',
      error: errorParam ?? 'Missing code or state in OAuth callback',
    });
    return;
  }

  const pending = pendingOAuth.get(state);
  if (!pending) {
    win.webContents.send(IPC_CHANNELS['jira:auth-error'], { wsId: '', error: 'Invalid OAuth state (expired or unknown)' });
    return;
  }
  pendingOAuth.delete(state);

  const { codeVerifier, wsId } = pending;

  try {
    const payload = await completeJiraOAuth(wsId, code, codeVerifier, pending.jiraUrl);
    win.webContents.send(IPC_CHANNELS['jira:auth-complete'], payload satisfies JiraAuthCompletePayload);
  } catch (err) {
    win.webContents.send(IPC_CHANNELS['jira:auth-error'], {
      wsId,
      error: err instanceof Error ? err.message : String(err),
    } satisfies JiraAuthErrorPayload);
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

  // macOS convention: close button hides the app window but keeps app/process alive.
  // This preserves renderer state (opened workspaces, running chats) when reopening from Dock.
  win.on('close', (event) => {
    if (process.platform !== 'darwin') return;
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

interface AgentRunNotificationRequest {
  workspaceId: string;
  workspaceName?: string;
  conversationId?: string | null;
  tabId?: string | null;
  conversationTitle?: string;
  provider?: AgentProvider;
  durationSeconds: number;
}

interface OpenAgentChatPayload {
  workspaceId: string;
  conversationId?: string | null;
  tabId?: string | null;
  eventId?: string;
}

function emitOpenAgentChat(payload: OpenAgentChatPayload): void {
  let win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    createWindow();
    win = BrowserWindow.getAllWindows()[0];
  }
  if (!win) return;

  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  const emit = () => {
    win?.webContents.send(IPC_CHANNELS['notification:openAgentChat'], payload);
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', emit);
  } else {
    emit();
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
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
  const url = argv.find((arg) => arg.startsWith('nakiros://'));
  if (url) void handleOAuthCallback(url);

  // Focus existing window
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ─── IPC: Workspace ───────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['dialog:selectDirectory'], async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle(IPC_CHANNELS['dialog:openFile'], async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle(IPC_CHANNELS['workspace:getAll'], () => getAll());
ipcMain.handle(IPC_CHANNELS['workspace:save'], (_, w: StoredWorkspace) => save(w));
ipcMain.handle(IPC_CHANNELS['workspace:delete'], (_, id: string) => remove(id));
ipcMain.handle(IPC_CHANNELS['workspace:createRoot'], (_, parentDir: string, workspaceName: string) =>
  createWorkspaceRoot(parentDir, workspaceName));
ipcMain.handle(IPC_CHANNELS['repo:detectProfile'], (_, path: string) => detectProfile(path));
ipcMain.handle(IPC_CHANNELS['repo:copyLocal'], (_, sourcePath: string, targetParentDir: string) =>
  copyRepoToDirectory(sourcePath, targetParentDir));
ipcMain.handle(IPC_CHANNELS['workspace:syncYaml'], (_, w: StoredWorkspace) => syncWorkspaceYaml(w));
ipcMain.handle(IPC_CHANNELS['workspace:getStartedContext'], (_, w: StoredWorkspace) =>
  getGettingStartedContext(w.name, w.repos.map((r) => r.localPath)));
ipcMain.handle(IPC_CHANNELS['workspace:saveStartedState'], (_, workspaceName: string, state: unknown) =>
  saveGettingStartedState(workspaceName, state as Parameters<typeof saveGettingStartedState>[1]));
ipcMain.handle(IPC_CHANNELS['workspace:reset'], (_, w: StoredWorkspace) => resetWorkspace(w));
ipcMain.handle(IPC_CHANNELS['workspace:sync'], (_, w: StoredWorkspace) => {
  const prefs = getPreferences();
  syncToRepos(w, prefs.mcpServerUrl || DEFAULT_MCP_SERVER_URL);
});
ipcMain.handle(IPC_CHANNELS['artifact:listContextFiles'], async (_event, workspace: StoredWorkspace) => {
  return listContextArtifactFiles(workspace);
});

ipcMain.handle(IPC_CHANNELS['artifact:readFile'], async (_event, workspace: StoredWorkspace, artifactPath: string) => {
  return readArtifactFile(workspace, artifactPath);
});

ipcMain.handle(IPC_CHANNELS['artifact:getFilePath'], (_event, workspace: StoredWorkspace, artifactPath: string) => {
  return getArtifactFilePath(workspace, artifactPath);
});

ipcMain.handle(IPC_CHANNELS['artifact:getContextTotalBytes'], async (_event, workspace: StoredWorkspace) => {
  return getContextArtifactTotalBytes(workspace);
});

ipcMain.handle(IPC_CHANNELS['artifact:listContextFilesWithSizes'], async (_event, workspace: StoredWorkspace) => {
  return listContextArtifactFilesWithSizes(workspace);
});

ipcMain.handle(IPC_CHANNELS['snapshot:take'], (_event, workspaceSlug: string, runId: string) => {
  return takeSnapshot(workspaceSlug, runId);
});

ipcMain.handle(IPC_CHANNELS['snapshot:diff'], (_event, workspaceSlug: string, runId: string) => {
  return diffSnapshot(workspaceSlug, runId);
});

ipcMain.handle(IPC_CHANNELS['snapshot:revert'], (_event, workspaceSlug: string, runId: string, relativePaths?: string[]) => {
  return revertSnapshot(workspaceSlug, runId, relativePaths);
});

ipcMain.handle(IPC_CHANNELS['snapshot:resolve'], (_event, workspaceSlug: string, runId: string) => {
  return resolveSnapshot(workspaceSlug, runId);
});

ipcMain.handle(IPC_CHANNELS['snapshot:listPending'], (_event, workspaceSlug: string) => {
  return listPendingSnapshots(workspaceSlug);
});

ipcMain.handle(IPC_CHANNELS['preview:check'], (_event, workspaceSlug: string) => {
  return checkPendingPreview(workspaceSlug);
});
ipcMain.handle(IPC_CHANNELS['preview:apply'], async (_event, previewRoot: string, workspaceSlug: string) => {
  return applyPreview(previewRoot, workspaceSlug);
});
ipcMain.handle(IPC_CHANNELS['preview:apply-file'], async (_event, previewRoot: string, filePath: string, workspaceSlug: string) => {
  return applyPreviewFile(previewRoot, filePath, workspaceSlug);
});
ipcMain.handle(IPC_CHANNELS['preview:discard'], (_event, previewRoot: string) => {
  discardPreview(previewRoot);
});
ipcMain.handle(IPC_CHANNELS['docs:scan'], (_, w: StoredWorkspace) => scanWorkspaceDocs(w));
ipcMain.handle(IPC_CHANNELS['docs:read'], (_, absolutePath: string) => readFileSync(absolutePath, 'utf-8'));
ipcMain.handle(IPC_CHANNELS['docs:write'], (_, absolutePath: string, content: string) => {
  writeFileSync(absolutePath, content, 'utf-8');
});

// File watchers per path (for doc editor yolo mode)
const docWatchers = new Map<string, FSWatcher>();
ipcMain.handle(IPC_CHANNELS['docs:watch'], (event, absolutePath: string) => {
  if (docWatchers.has(absolutePath)) return;
  const watcher = chokidar.watch(absolutePath, { ignoreInitial: true });
  watcher.on('change', () => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.send(IPC_CHANNELS['docs:changed'], absolutePath);
  });
  docWatchers.set(absolutePath, watcher);
});
ipcMain.handle(IPC_CHANNELS['docs:unwatch'], async (_, absolutePath: string) => {
  const watcher = docWatchers.get(absolutePath);
  if (watcher) {
    await watcher.close();
    docWatchers.delete(absolutePath);
  }
});
ipcMain.handle(IPC_CHANNELS['shell:openPath'], (_, path: string) => shell.openPath(path));
ipcMain.handle(IPC_CHANNELS['git:remoteUrl'], async (_, repoPath: string) => {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
});
ipcMain.handle(IPC_CHANNELS['git:clone'], async (_, url: string, parentDir: string) => {
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
ipcMain.handle(IPC_CHANNELS['git:init'], async (_, repoPath: string) => {
  try {
    await initGitRepo(repoPath);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
});
ipcMain.handle(IPC_CHANNELS['preferences:get'], () => getPreferences());
ipcMain.handle(IPC_CHANNELS['preferences:getSystemLanguage'], () => {
  const locale = app.getPreferredSystemLanguages()[0] ?? app.getLocale() ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
});
ipcMain.handle(IPC_CHANNELS['preferences:save'], (_, prefs: AppPreferences) => savePreferences(prefs));
ipcMain.handle(IPC_CHANNELS['agents:status'], (_, repoPath: string) => getAgentInstallStatus(repoPath));
ipcMain.handle(IPC_CHANNELS['agents:install'], (_, request: AgentInstallRequest) => installAgents(request));
ipcMain.handle(IPC_CHANNELS['agents:global-status'], () => getGlobalInstallStatus());
ipcMain.handle(IPC_CHANNELS['agents:installed-commands'], () => getInstalledCommands());
ipcMain.handle(IPC_CHANNELS['agents:install-global'], () => installAgentsGlobally());
ipcMain.handle(IPC_CHANNELS['agents:cli-status'], () => getAgentCliStatus());

// ─── IPC: Onboarding ──────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['onboarding:detectEditors'], () => detectEditors());
ipcMain.handle(IPC_CHANNELS['onboarding:nakirosConfigExists'], () => nakirosConfigExists());
ipcMain.handle(IPC_CHANNELS['onboarding:install'], async (event, editors: unknown[]) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, errors: ['No window'] };
  return installNakiros(editors as Parameters<typeof installNakiros>[0], win);
});

// ─── IPC: Auth (removed — open-source local-first) ──────────────────────────


// ─── IPC: Tickets ─────────────────────────────────────────────────────────────

function resolveSlug(wsId: string): string {
  const ws = getAll().find((w) => w.id === wsId);
  return ws ? toWorkspaceSlug(ws.name) : wsId;
}

ipcMain.handle(IPC_CHANNELS['ticket:getAll'], (_, wsId: string) => getTickets(resolveSlug(wsId)));
ipcMain.handle(IPC_CHANNELS['ticket:save'], (_, wsId: string, t: LocalTicket) => saveTicket(resolveSlug(wsId), t));
ipcMain.handle(IPC_CHANNELS['ticket:remove'], (_, wsId: string, id: string) => removeTicket(resolveSlug(wsId), id));

// ─── IPC: Epics ───────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['epic:getAll'], (_, wsId: string) => getEpics(resolveSlug(wsId)));
ipcMain.handle(IPC_CHANNELS['epic:save'], (_, wsId: string, e: LocalEpic) => saveEpic(resolveSlug(wsId), e));
ipcMain.handle(IPC_CHANNELS['epic:remove'], (_, wsId: string, id: string) => removeEpic(resolveSlug(wsId), id));

// ─── IPC: Agent context + clipboard ──────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['agent:context'], (_, wsId: string, ticketId: string, ws: StoredWorkspace) =>
  generateContext(resolveSlug(wsId), ticketId, ws));
ipcMain.handle(IPC_CHANNELS['clipboard:write'], (_, text: string) => clipboard.writeText(text));
ipcMain.handle(IPC_CHANNELS['notification:showAgentRun'], (_, payload: AgentRunNotificationRequest) => {
  if (!Notification.isSupported()) return;

  const durationLabel = formatDuration(Math.max(1, payload.durationSeconds));
  const title = payload.workspaceName ? `Nakiros · ${payload.workspaceName}` : 'Nakiros';
  const body = payload.conversationTitle
    ? `“${payload.conversationTitle}” finished in ${durationLabel}.`
    : `A chat response finished in ${durationLabel}.`;

  const options: Electron.NotificationConstructorOptions = {
    title,
    body,
  };

  if (process.platform === 'darwin') {
    options.actions = [{ type: 'button', text: 'Open Chat' }];
    options.closeButtonText = 'Dismiss';
  }

  const openPayload: OpenAgentChatPayload = {
    workspaceId: payload.workspaceId,
    conversationId: payload.conversationId ?? null,
    tabId: payload.tabId ?? null,
    eventId: `notif-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  };

  const notification = new Notification(options);
  notification.on('click', () => emitOpenAgentChat(openPayload));
  notification.on('action', (_event, index) => {
    if (index === 0) emitOpenAgentChat(openPayload);
  });
  notification.show();
});

// ─── IPC: Terminal (node-pty) ─────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['terminal:create'], (event, repoPath: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const terminalId = createTerminal(
    repoPath,
    (data) => win?.webContents.send(IPC_CHANNELS['terminal:data'], { terminalId, data }),
    (code) => win?.webContents.send(IPC_CHANNELS['terminal:exit'], { terminalId, code }),
  );
  return terminalId;
});

ipcMain.handle(IPC_CHANNELS['terminal:write'], (_, terminalId: string, data: string) => {
  writeToTerminal(terminalId, data);
});

ipcMain.handle(IPC_CHANNELS['terminal:resize'], (_, terminalId: string, cols: number, rows: number) => {
  resizeTerminal(terminalId, cols, rows);
});

ipcMain.handle(IPC_CHANNELS['terminal:destroy'], (_, terminalId: string) => {
  destroyTerminal(terminalId);
});

// ─── IPC: Agent runner (provider: claude/codex/cursor) ───────────────────────

ipcMain.handle(
  IPC_CHANNELS['agent:run'],
  async (
    event,
    request: AgentRunRequest,
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const prefs = getPreferences();
    const repoPath = request.anchorRepoPath;
    const additionalDirs = request.additionalDirs ?? request.activeRepoPaths;
    const requestedProvider = request.provider;
    const provider = (
      requestedProvider === 'claude'
      || requestedProvider === 'codex'
      || requestedProvider === 'cursor'
    )
      ? requestedProvider
      : (prefs.agentProvider ?? 'claude');
    // Sync workspace symlinks so ~/.nakiros/workspaces/{slug}/ is up to date before the run.
    const allWorkspaces = getAll();
    const workspace = allWorkspaces.find((w) => w.id === request.workspaceId);
    const workspaceSlug = workspace ? resolveWorkspaceSlug(workspace.id, workspace.name) : '';
    if (workspace) {
      try { syncWorkspaceSymlinks(workspace); } catch (err) {
        console.warn(`[agent:run] Unable to sync workspace symlinks: ${String(err)}`);
      }
    }
    const nakirosWorkspaceDir = workspaceSlug ? getNakirosWorkspaceDir(workspaceSlug) : resolve(homedir(), '.nakiros');
    const effectiveAgentCwd = resolveAgentCwd(repoPath, additionalDirs, nakirosWorkspaceDir);

    try {
      ensureCommandsInRepo(nakirosWorkspaceDir, provider);
    } catch (err) {
      console.warn(`[agent:run] Unable to ensure command templates in workspace dir: ${String(err)}`);
    }
    if (effectiveAgentCwd !== nakirosWorkspaceDir) {
      try {
        ensureCommandsInRepo(effectiveAgentCwd, provider);
      } catch (err) {
        console.warn(`[agent:run] Unable to ensure command templates in effective cwd ${effectiveAgentCwd}: ${String(err)}`);
      }
    }

    const rawLines: unknown[] = [];
    let runId = '';
    runId = runAgentCommand(
      provider,
      request,
      (info) => {
        runId = info.runId;
        win?.webContents.send(IPC_CHANNELS['agent:start'], info);
      },
      (evt) => win?.webContents.send(IPC_CHANNELS['agent:event'], { runId, event: evt }),
      (exitCode, error, lines) => win?.webContents.send(IPC_CHANNELS['agent:done'], { runId, exitCode, error, rawLines: lines ?? [] }),
      (raw) => rawLines.push(raw),
    );
    return runId;
  },
);

ipcMain.handle(IPC_CHANNELS['agent:cancel'], (_, runId: string) => {
  cancelAgentRun(runId);
});


// ─── IPC: Conversations ───────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['conversation:getAll'], (_, workspaceId: string) => getConversations(resolveSlug(workspaceId), workspaceId));
ipcMain.handle(IPC_CHANNELS['conversation:save'], () => {
  // Sessions are now persisted by the orchestrator — no-op from Desktop side.
});
ipcMain.handle(IPC_CHANNELS['conversation:delete'], (_, id: string, workspaceId: string) => deleteConversationEntry(id, resolveSlug(workspaceId)));

// ─── IPC: Agent tabs (multi-conversations state) ────────────────────────────

ipcMain.handle(IPC_CHANNELS['agentTabs:get'], (_, workspaceId: string) => getAgentTabsState(resolveSlug(workspaceId)));
ipcMain.handle(IPC_CHANNELS['agentTabs:save'], (_, workspaceId: string, state: StoredAgentTabsState) =>
  saveAgentTabsState(resolveSlug(workspaceId), state));
ipcMain.handle(IPC_CHANNELS['agentTabs:clear'], (_, workspaceId: string) => clearAgentTabsState(resolveSlug(workspaceId)));

// ─── IPC: Jira OAuth ─────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['jira:startAuth'], (_, wsId: string, jiraUrl?: string) => {
  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePKCE();
  pendingOAuth.set(state, { codeVerifier, wsId, jiraUrl: jiraUrl?.trim() || undefined });
  openAuthUrl(state, codeChallenge);
});

ipcMain.handle(IPC_CHANNELS['jira:disconnect'], (_, wsId: string) => disconnectJira(wsId));

ipcMain.handle(IPC_CHANNELS['jira:getStatus'], (_, wsId: string) => getJiraStatus(wsId));

ipcMain.handle(IPC_CHANNELS['jira:syncTickets'], async (_, wsId: string, workspace: StoredWorkspace) => {
  // Ensure we use the persisted cloudId (workspace from renderer may be stale)
  const persisted = getAll().find((w) => w.id === wsId) ?? workspace;
  return syncWorkspaceJiraTickets(wsId, persisted);
});

ipcMain.handle(IPC_CHANNELS['jira:getProjects'], async (_, wsId: string) => getJiraProjects(wsId));

ipcMain.handle(IPC_CHANNELS['jira:countTickets'], async (_, wsId: string, projectKey: string, syncFilter: string, boardType: string) =>
  countJiraTickets(wsId, projectKey, syncFilter as JiraSyncFilter, boardType as 'scrum' | 'kanban' | 'unknown'));

ipcMain.handle(IPC_CHANNELS['jira:getBoardType'], async (_, wsId: string, projectKey: string) =>
  getJiraBoardSelection(wsId, projectKey));

// ─── MCP Server ───────────────────────────────────────────────────────────────

type McpServerStatus = 'starting' | 'running' | 'stopped';

function broadcastServerStatus(status: McpServerStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS['server:status-change'], status);
  }
}

ipcMain.handle(IPC_CHANNELS['server:getStatus'], async () => {
  const prefs = getPreferences();
  const baseUrl = prefs.mcpServerUrl || DEFAULT_MCP_SERVER_URL;
  try {
    const res = await fetch(`${baseUrl}/status`);
    return res.ok ? 'running' : 'stopped';
  } catch {
    return 'stopped';
  }
});

ipcMain.handle(IPC_CHANNELS['server:restart'], async () => {
  broadcastServerStatus('starting');
  stopServer();
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  try {
    await startServer(3737);
    broadcastServerStatus('running');
  } catch (err) {
    broadcastServerStatus('stopped');
    console.error('[Nakiros] Failed to restart MCP server:', (err as Error).message);
  }
});

async function ensureMcpServer(port: number): Promise<void> {
  broadcastServerStatus('starting');

  try {
    const res = await fetch(`http://localhost:${port}/status`);
    if (res.ok) {
      console.log(`[Nakiros] MCP server already running on http://localhost:${port}`);
      broadcastServerStatus('running');
      return;
    }
  } catch {
    // Nothing running on that port — start our own
  }

  try {
    await startServer(port);
    broadcastServerStatus('running');
    console.log(`[Nakiros] MCP server running on http://localhost:${port}`);
  } catch (err) {
    broadcastServerStatus('stopped');
    console.error('[Nakiros] Failed to start MCP server:', (err as Error).message);
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
  isQuitting = true;
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
