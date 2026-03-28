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
import { getHydratedWorkspaces, saveCanonicalWorkspace } from './services/workspace-remote.js';
import { syncWorkspaceYaml } from './services/workspace-yaml.js';
import { getAuthState, signIn, signOut } from './services/auth.js';
import { getMyOrg, listMyOrgs, createOrg, deleteOrg, listOrgMembers, addOrgMember, leaveOrg, removeOrgMember, cancelInvitation, acceptInvitations } from './services/org.js';
import { assertWorkspaceLaunchAllowed, listWorkspaceMembers, removeWorkspaceMember, upsertWorkspaceMember } from './services/workspace-members.js';
import { resetWorkspace } from './services/workspace-reset.js';
import { detectProfile } from './services/profile-detector.js';
import { syncToRepos } from './services/workspace-sync.js';
import { createWorkspaceRoot, copyRepoToDirectory, initGitRepo } from './services/workspace-bootstrap.js';
import { scanWorkspaceDocs } from './services/doc-scanner.js';
import { getPreferences, savePreferences } from './services/preferences.js';
import {
  bindWorkspaceProviderCredential,
  createProviderCredential,
  deleteProviderCredential,
  getWorkspaceProviderCredentials,
  listProviderCredentials,
  revokeProviderCredential,
  setWorkspaceProviderDefault,
  unbindWorkspaceProviderCredential,
  updateProviderCredential,
} from './services/provider-credentials.js';
import {
  getAgentInstallStatus,
  getGlobalInstallStatus,
  getInstalledCommands,
  installAgents,
  installAgentsGlobally,
  ensureCommandsInRepo,
} from './services/agent-installer.js';
import { detectEditors, nakirosConfigExists, installNakiros } from './services/onboarding-installer.js';
import { checkForUpdates, applyUpdate, getVersionInfo } from './services/update-checker.js';
import { getAgentCliStatus } from './services/agent-cli.js';
import {
  getTickets, saveTicket, removeTicket,
  getEpics, saveEpic, removeEpic,
  toWorkspaceSlug,
} from './services/ticket-storage.js';
import { getGettingStartedContext, saveGettingStartedState } from './services/getting-started-state.js';
import {
  getBacklogStories,
  getBacklogEpics,
  createBacklogEpic,
  updateBacklogEpic,
  createBacklogStory,
  updateBacklogStory,
  getBacklogTasks,
  createBacklogTask,
  updateBacklogTask,
  getBacklogSprints,
  createBacklogSprint,
  updateBacklogSprint,
} from './services/backlog-service.js';
import { generateContext } from './services/agent-context.js';
import { createTerminal, writeToTerminal, resizeTerminal, destroyTerminal } from './services/terminal.js';
import { runAgentCommand, cancelAgentRun, resolveAgentCwd } from './services/agent-runner-bridge.js';
import { startWorkspaceSyncBridge, stopAllSyncBridges, triggerSyncPush } from './services/sync-bridge.js';
import { executeAction } from './services/action-orchestrator.js';
import { getConversations, deleteConversationEntry } from './services/conversation-reader.js';
import { pushWorkspaceContext, pullRemoteContext } from './services/context-sync.js';
import {
  readArtifactFile,
  saveArtifactVersion,
  listArtifactVersions,
  listAllArtifacts,
  pullAllArtifacts,
  listContextArtifactFiles,
  getArtifactFilePath,
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
import { sendSessionFeedback, sendProductFeedback, retryQueue } from './services/feedback-service.js';
import type { SessionFeedbackData, ProductFeedbackData } from './services/feedback-service.js';
import type {
  AgentRunRequest,
  AuthCompletePayload,
  AuthErrorPayload,
  AuthSignedOutPayload,
  NakirosActionBlock,
  StoredWorkspace,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentInstallRequest,
  AgentProvider,
  BindWorkspaceProviderCredentialInput,
  CreateProviderCredentialInput,
  JiraAuthCompletePayload,
  JiraAuthErrorPayload,
  JiraSyncFilter,
  SetWorkspaceProviderDefaultInput,
  StoredAgentTabsState,
  CreateEpicPayload,
  UpdateEpicPayload,
  CreateStoryPayload,
  UpdateStoryPayload,
  CreateTaskPayload,
  UpdateTaskPayload,
  CreateSprintPayload,
  UpdateSprintPayload,
  UpsertWorkspaceMembershipInput,
  UpdateProviderCredentialInput,
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

  // ── Nakiros auth callback — handled by BrowserWindow popup in signIn() ──
  if (parsed.hostname === 'auth') return;

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
ipcMain.handle(IPC_CHANNELS['workspace:getAll'], async (event) => {
  const workspaces = await getHydratedWorkspaces();
  // Start a file-watcher sync bridge for each workspace (idempotent)
  for (const ws of workspaces) {
    startWorkspaceSyncBridge(ws, (syncEvent) => {
      // Forward NDJSON events from nakiros subprocess to the renderer
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC_CHANNELS['sync:event'], syncEvent);
      });
    });
  }
  void event; // event.sender not needed — we broadcast to all windows
  return workspaces;
});
ipcMain.handle(IPC_CHANNELS['workspace:listMembers'], (_, workspaceId: string) => listWorkspaceMembers(workspaceId));
ipcMain.handle(
  IPC_CHANNELS['workspace:upsertMember'],
  (_, workspaceId: string, input: UpsertWorkspaceMembershipInput) => upsertWorkspaceMember(workspaceId, input),
);
ipcMain.handle(IPC_CHANNELS['workspace:removeMember'], (_, workspaceId: string, userId: string) => removeWorkspaceMember(workspaceId, userId));
ipcMain.handle(IPC_CHANNELS['workspace:save'], (_, w: StoredWorkspace) => save(w));
ipcMain.handle(IPC_CHANNELS['workspace:saveCanonical'], (_, w: StoredWorkspace) => saveCanonicalWorkspace(w));
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
ipcMain.handle(IPC_CHANNELS['context:push'], (_, w: StoredWorkspace, force?: boolean) => pushWorkspaceContext(w, force));
ipcMain.handle(IPC_CHANNELS['context:pull'], (_, w: StoredWorkspace) => pullRemoteContext(w));

ipcMain.handle(IPC_CHANNELS['artifact:listVersions'], async (_event, workspaceId: string, artifactPath: string) => {
  return listArtifactVersions(workspaceId, artifactPath);
});

ipcMain.handle(IPC_CHANNELS['artifact:saveVersion'], async (_event, workspaceId: string, workspace: StoredWorkspace, input: unknown) => {
  return saveArtifactVersion(workspaceId, workspace, input as import('@nakiros/shared').SaveProductArtifactInput);
});

ipcMain.handle(IPC_CHANNELS['artifact:listAll'], async (_event, workspaceId: string) => {
  return listAllArtifacts(workspaceId);
});

ipcMain.handle(IPC_CHANNELS['artifact:pullAll'], async (_event, workspaceId: string, workspace: StoredWorkspace) => {
  return pullAllArtifacts(workspaceId, workspace);
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
  const result = await applyPreview(previewRoot, workspaceSlug);
  const ws = getAll().find((w) => resolveWorkspaceSlug(w.id, w.name) === workspaceSlug);
  if (ws) triggerSyncPush(ws.id);
  return result;
});
ipcMain.handle(IPC_CHANNELS['preview:apply-file'], async (_event, previewRoot: string, filePath: string, workspaceSlug: string) => {
  const result = await applyPreviewFile(previewRoot, filePath, workspaceSlug);
  const ws = getAll().find((w) => resolveWorkspaceSlug(w.id, w.name) === workspaceSlug);
  if (ws) triggerSyncPush(ws.id);
  return result;
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
ipcMain.handle(IPC_CHANNELS['providerCredentials:getAll'], () => listProviderCredentials());
ipcMain.handle(IPC_CHANNELS['providerCredentials:create'], (_, input: CreateProviderCredentialInput) => createProviderCredential(input));
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:update'],
  (_, credentialId: string, input: UpdateProviderCredentialInput) => updateProviderCredential(credentialId, input),
);
ipcMain.handle(IPC_CHANNELS['providerCredentials:revoke'], (_, credentialId: string) => revokeProviderCredential(credentialId));
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:delete'],
  (_, credentialId: string, force?: boolean) => deleteProviderCredential(credentialId, force),
);
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:getWorkspace'],
  (_, workspaceId: string) => getWorkspaceProviderCredentials(workspaceId),
);
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:bindWorkspace'],
  (_, workspaceId: string, input: BindWorkspaceProviderCredentialInput) => bindWorkspaceProviderCredential(workspaceId, input),
);
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:unbindWorkspace'],
  (_, workspaceId: string, credentialId: string) => unbindWorkspaceProviderCredential(workspaceId, credentialId),
);
ipcMain.handle(
  IPC_CHANNELS['providerCredentials:setWorkspaceDefault'],
  (_, workspaceId: string, input: SetWorkspaceProviderDefaultInput) => setWorkspaceProviderDefault(workspaceId, input),
);
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

// ─── IPC: Updates ─────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['updates:check'], (_, force?: boolean, channel?: 'stable' | 'beta') =>
  checkForUpdates(force, channel ?? (getPreferences().agentChannel ?? 'stable')));
ipcMain.handle(IPC_CHANNELS['updates:apply'], async (event, files: unknown[], bundleVersion: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  return applyUpdate(files as Parameters<typeof applyUpdate>[0], bundleVersion, win);
});
ipcMain.handle(IPC_CHANNELS['updates:getVersionInfo'], () => getVersionInfo());

// ─── IPC: Auth ────────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['auth:getState'], () => getAuthState());
ipcMain.handle(IPC_CHANNELS['org:getMine'], () => getMyOrg());
ipcMain.handle(IPC_CHANNELS['org:listMine'], () => listMyOrgs());
ipcMain.handle(IPC_CHANNELS['org:create'], (_event, name: string, slug: string) => createOrg(name, slug));
ipcMain.handle(IPC_CHANNELS['org:delete'], (_event, orgId: string) => deleteOrg(orgId));
ipcMain.handle(IPC_CHANNELS['org:listMembers'], (_event, orgId: string) => listOrgMembers(orgId));
ipcMain.handle(
  IPC_CHANNELS['org:addMember'],
  (_event, orgId: string, email: string, role: 'member' | 'admin', inviterEmail?: string) =>
    addOrgMember(orgId, email, role, inviterEmail),
);
ipcMain.handle(IPC_CHANNELS['org:leave'], (_event, orgId: string) => leaveOrg(orgId));
ipcMain.handle(IPC_CHANNELS['org:removeMember'], (_event, orgId: string, userId: string) => removeOrgMember(orgId, userId));
ipcMain.handle(IPC_CHANNELS['org:cancelInvitation'], (_event, orgId: string, invitationId: string) => cancelInvitation(orgId, invitationId));
ipcMain.handle(IPC_CHANNELS['org:acceptInvitations'], (_event, email: string) => acceptInvitations(email));
ipcMain.handle(IPC_CHANNELS['auth:signIn'], async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  signIn(win ?? undefined)
    .then(async (result) => {
      win?.webContents.send(IPC_CHANNELS['auth:complete'], { email: result.email } satisfies AuthCompletePayload);
      for (const ws of getAll()) {
        try { await syncWorkspaceYaml(ws); } catch (error) {
          console.error(`[auth] Failed to sync workspace "${ws.name}" after sign-in:`, error);
        }
        // Trigger push for any files saved while offline
        triggerSyncPush(ws.id);
      }
    })
    .catch((error: unknown) => {
      console.error('[auth] Sign-in failed:', error);
      const message = error instanceof Error ? error.message : 'Authentication failed';
      if (message !== 'Cancelled') {
        win?.webContents.send(IPC_CHANNELS['auth:error'], { message } satisfies AuthErrorPayload);
      }
    });
});
ipcMain.handle(IPC_CHANNELS['auth:signOut'], async () => {
  await signOut();
  // Re-sync workspaces to remove the token from .claude/settings.json
  for (const ws of getAll()) {
    try {
      await syncWorkspaceYaml(ws);
    } catch (error) {
      console.error(`[auth] Failed to sync workspace "${ws.name}" after sign-out:`, error);
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS['auth:signedOut'], {} satisfies AuthSignedOutPayload);
  }
});

// ─── IPC: Backlog ─────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['backlog:getStories'], (_, workspaceId: string) => getBacklogStories(workspaceId));
ipcMain.handle(IPC_CHANNELS['backlog:getEpics'], (_, workspaceId: string) => getBacklogEpics(workspaceId));
ipcMain.handle(IPC_CHANNELS['backlog:createEpic'], (_, workspaceId: string, body: CreateEpicPayload) => createBacklogEpic(workspaceId, body));
ipcMain.handle(IPC_CHANNELS['backlog:updateEpic'], (_, workspaceId: string, epicId: string, body: UpdateEpicPayload) => updateBacklogEpic(workspaceId, epicId, body));
ipcMain.handle(IPC_CHANNELS['backlog:createStory'], (_, workspaceId: string, body: CreateStoryPayload) => createBacklogStory(workspaceId, body));
ipcMain.handle(IPC_CHANNELS['backlog:updateStory'], (_, workspaceId: string, storyId: string, body: UpdateStoryPayload) => updateBacklogStory(workspaceId, storyId, body));
ipcMain.handle(IPC_CHANNELS['backlog:getTasks'], (_, workspaceId: string, storyId: string) => getBacklogTasks(workspaceId, storyId));
ipcMain.handle(IPC_CHANNELS['backlog:createTask'], (_, workspaceId: string, storyId: string, body: CreateTaskPayload) => createBacklogTask(workspaceId, storyId, body));
ipcMain.handle(IPC_CHANNELS['backlog:updateTask'], (_, workspaceId: string, storyId: string, taskId: string, body: UpdateTaskPayload) =>
  updateBacklogTask(workspaceId, storyId, taskId, body));
ipcMain.handle(IPC_CHANNELS['backlog:getSprints'], (_, workspaceId: string) => getBacklogSprints(workspaceId));
ipcMain.handle(IPC_CHANNELS['backlog:createSprint'], (_, workspaceId: string, body: CreateSprintPayload) => createBacklogSprint(workspaceId, body));
ipcMain.handle(IPC_CHANNELS['backlog:updateSprint'], (_, workspaceId: string, sprintId: string, body: UpdateSprintPayload) => updateBacklogSprint(workspaceId, sprintId, body));

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
    await assertWorkspaceLaunchAllowed({
      workspaceId: request.workspaceId,
      enforceRoles: (prefs.agentChannel ?? 'stable') !== 'beta',
    });
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

ipcMain.handle(IPC_CHANNELS['agent:action-execute'], (_, workspaceId: string, block: NakirosActionBlock) =>
  executeAction(workspaceId, block),
);

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

// ─── Feedback ─────────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['feedback:sendSession'], async (_, data: SessionFeedbackData) => {
  await sendSessionFeedback(data);
});

ipcMain.handle(IPC_CHANNELS['feedback:sendProduct'], async (_, data: ProductFeedbackData) => {
  await sendProductFeedback(data);
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
  void retryQueue();

  // Auto-check for agent/workflow updates (5s delay, respects 24h cooldown)
  setTimeout(() => {
    void (async () => {
      try {
        const channel = getPreferences().agentChannel ?? 'stable';
        const result = await checkForUpdates(false, channel);
        if (result.compatible && result.hasUpdate) {
          const win = BrowserWindow.getAllWindows()[0];
          win?.webContents.send(IPC_CHANNELS['updates:available'], result);
        }
      } catch {
        // Silently ignore startup update check errors
      }
    })();
  }, 5000);

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
  stopAllSyncBridges();
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
