import { app, BrowserWindow, ipcMain, shell, clipboard, nativeImage, Notification } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

import { startServer, stopServer } from '@nakiros/server';
import { DEFAULT_MCP_SERVER_URL, IPC_CHANNELS } from '@nakiros/shared';
import { getPreferences, savePreferences } from './services/preferences.js';
import {
  getAgentInstallStatus,
  getGlobalInstallStatus,
  getInstalledCommands,
  installAgents,
  installAgentsGlobally,
} from './services/agent-installer.js';
import { detectEditors, nakirosConfigExists, installNakiros } from './services/onboarding-installer.js';
import { getAgentCliStatus } from './services/agent-cli.js';
import type {
  AppPreferences,
  AgentInstallRequest,
  AgentProvider,
} from '@nakiros/shared';
import {
  scan as scanProjects,
  listProjects,
  getProject,
  dismissProject,
} from './services/project-scanner.js';
import { listConversations, getConversationMessages } from './services/conversation-parser.js';
import { listSkills, getSkill, saveSkill, readSkillFile, saveSkillFile } from './services/skill-reader.js';
import { syncBundledSkills, promoteBundledSkill } from './services/bundled-skills-sync.js';
import {
  listBundledSkills,
  readBundledSkill,
  readBundledSkillFile,
  saveBundledSkillFile,
} from './services/bundled-skills-reader.js';
import {
  getClaudeGlobalSkillsDir,
  listClaudeGlobalSkills,
  readClaudeGlobalSkill,
  readClaudeGlobalSkillFile,
  saveClaudeGlobalSkillFile,
} from './services/claude-global-skills-reader.js';
import {
  startEvalRuns,
  stopRun as stopEvalRun,
  listRuns as listEvalRuns,
  loadPersistedRuns,
  sendUserMessage as sendEvalUserMessage,
  finishWaitingRun as finishEvalWaitingRun,
  getRun as getEvalRun,
} from './services/eval-runner.js';
import { readIterationFeedback, saveEvalFeedback } from './services/eval-feedback.js';
import {
  startAudit,
  stopAudit,
  getAuditRun,
  sendAuditUserMessage,
  listAuditHistory,
  readAuditReport,
  listActiveAuditRuns,
} from './services/audit-runner.js';
import {
  startFix,
  stopFix,
  getFixRun,
  sendFixUserMessage,
  finishFix,
  restoreOrCleanupTempWorkdirs,
  getFixTempWorkdir,
  getFixRealSkillDir,
  listActiveFixRuns,
  getFixBufferedEvents,
  startCreate,
  stopCreate,
  getCreateRun,
  sendCreateUserMessage,
  finishCreate,
  listActiveCreateRuns,
  getCreateBufferedEvents,
} from './services/fix-runner.js';
import { readLatestIterationBenchmark } from './services/eval-benchmark.js';
import { cleanupEvalArtifacts } from './services/eval-artifact-cleanup.js';

// ─── Single-instance lock ─────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
let isQuitting = false;

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
  // This preserves renderer state when reopening from Dock.
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

// ─── Windows/Linux: second-instance (single-instance lock) ───────────────────

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ─── IPC: Shell + clipboard ──────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['shell:openPath'], (_, path: string) => shell.openPath(path));
ipcMain.handle(IPC_CHANNELS['clipboard:write'], (_, text: string) => clipboard.writeText(text));

// ─── IPC: Preferences ────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS['preferences:get'], () => getPreferences());
ipcMain.handle(IPC_CHANNELS['preferences:getSystemLanguage'], () => {
  const locale = app.getPreferredSystemLanguages()[0] ?? app.getLocale() ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
});
ipcMain.handle(IPC_CHANNELS['preferences:save'], (_, prefs: AppPreferences) => savePreferences(prefs));

// ─── IPC: Agent installer ────────────────────────────────────────────────────

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

// ─── IPC: Notifications ──────────────────────────────────────────────────────

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

  // Sync bundled Nakiros skills to ~/.claude/skills/
  syncBundledSkills();

  // Rehydrate in-flight fix/create runs from their temp workdirs, or clean up
  // truly-orphan dirs (completed/failed/corrupt run.json).
  restoreOrCleanupTempWorkdirs();

  // Clean up stray skills produced by eval runs in previous sessions
  cleanupEvalArtifacts();

  void ensureMcpServer(3737);
});

// ─── Nakiros Agent Team — Project IPC handlers ──────────────────────────────

ipcMain.handle(IPC_CHANNELS['project:scan'], () => {
  return scanProjects((current, total, name) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send(IPC_CHANNELS['project:scanProgress'], { provider: 'claude', current, total, projectName: name });
    }
  });
});
ipcMain.handle(IPC_CHANNELS['project:list'], () => listProjects());
ipcMain.handle(IPC_CHANNELS['project:get'], (_, id: string) => getProject(id));
ipcMain.handle(IPC_CHANNELS['project:dismiss'], (_, id: string) => dismissProject(id));

ipcMain.handle(IPC_CHANNELS['project:listConversations'], (_, projectId: string) => {
  const project = getProject(projectId);
  if (!project) return [];
  return listConversations(project.providerProjectDir, projectId);
});

ipcMain.handle(IPC_CHANNELS['project:getConversationMessages'], (_, projectId: string, sessionId: string) => {
  const project = getProject(projectId);
  if (!project) return [];
  return getConversationMessages(project.providerProjectDir, sessionId);
});

ipcMain.handle(IPC_CHANNELS['project:listSkills'], (_, projectId: string) => {
  const project = getProject(projectId);
  if (!project) return [];
  return listSkills(project.projectPath, projectId);
});

ipcMain.handle(IPC_CHANNELS['project:getSkill'], (_, projectId: string, skillName: string) => {
  const project = getProject(projectId);
  if (!project) return null;
  return getSkill(project.projectPath, projectId, skillName);
});

ipcMain.handle(IPC_CHANNELS['project:saveSkill'], (_, projectId: string, skillName: string, content: string) => {
  const project = getProject(projectId);
  if (!project) return;
  saveSkill(project.projectPath, skillName, content);
});

ipcMain.handle(IPC_CHANNELS['project:readSkillFile'], (_, projectId: string, skillName: string, relativePath: string) => {
  const project = getProject(projectId);
  if (!project) return null;
  return readSkillFile(project.projectPath, skillName, relativePath);
});

ipcMain.handle(IPC_CHANNELS['project:saveSkillFile'], (_, projectId: string, skillName: string, relativePath: string, content: string) => {
  const project = getProject(projectId);
  if (!project) return;
  saveSkillFile(project.projectPath, skillName, relativePath, content);
});

// Nakiros bundled skills (shipped with the app itself)
ipcMain.handle(IPC_CHANNELS['nakiros:listBundledSkills'], () => listBundledSkills());
ipcMain.handle(IPC_CHANNELS['nakiros:getBundledSkill'], (_, skillName: string) => readBundledSkill(skillName));
ipcMain.handle(IPC_CHANNELS['nakiros:readBundledSkillFile'], (_, skillName: string, relativePath: string) =>
  readBundledSkillFile(skillName, relativePath),
);
ipcMain.handle(IPC_CHANNELS['nakiros:saveBundledSkillFile'], (_, skillName: string, relativePath: string, content: string) =>
  saveBundledSkillFile(skillName, relativePath, content),
);
ipcMain.handle(IPC_CHANNELS['nakiros:promoteBundledSkill'], (_, skillName: string) =>
  promoteBundledSkill(skillName),
);

// User-global skills (~/.claude/skills/, excluding symlinks)
ipcMain.handle(IPC_CHANNELS['claudeGlobal:listSkills'], () => listClaudeGlobalSkills());
ipcMain.handle(IPC_CHANNELS['claudeGlobal:getSkill'], (_, skillName: string) => readClaudeGlobalSkill(skillName));
ipcMain.handle(IPC_CHANNELS['claudeGlobal:readSkillFile'], (_, skillName: string, relativePath: string) =>
  readClaudeGlobalSkillFile(skillName, relativePath),
);
ipcMain.handle(IPC_CHANNELS['claudeGlobal:saveSkillFile'], (_, skillName: string, relativePath: string, content: string) =>
  saveClaudeGlobalSkillFile(skillName, relativePath, content),
);

/**
 * Read a skill file as a data URL — the only way to display binary assets
 * (png/jpg/svg/…) inline in the renderer without exposing the filesystem via
 * a custom protocol. Returns null for missing files or unsupported types.
 */
const DATA_URL_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

ipcMain.handle(
  IPC_CHANNELS['skill:readFileAsDataUrl'],
  (_, request: { scope: 'project' | 'nakiros-bundled' | 'claude-global'; projectId?: string; skillName: string; relativePath: string }): string | null => {
    const skillDir = resolveEvalSkillDir(request as import('@nakiros/shared').StartEvalRunRequest);
    const abs = resolve(skillDir, request.relativePath);
    if (!abs.startsWith(skillDir + '/') && abs !== skillDir) return null;
    if (!existsSync(abs)) return null;
    const ext = request.relativePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = DATA_URL_MIME_BY_EXT[ext];
    if (!mime) return null;
    try {
      const buf = readFileSync(abs);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  },
);

// ─── Eval runner ────────────────────────────────────────────────────────────

function resolveEvalSkillDir(request: import('@nakiros/shared').StartEvalRunRequest): string {
  // skillDirOverride takes precedence — used by fix runs to evaluate the temp workdir copy.
  if (request.skillDirOverride) {
    return request.skillDirOverride;
  }
  if (request.scope === 'nakiros-bundled') {
    // Canonical location is ~/.nakiros/skills/{skillName}. Claude sees it via symlink in ~/.claude/skills/.
    return join(homedir(), '.nakiros', 'skills', request.skillName);
  }
  if (request.scope === 'claude-global') {
    return join(getClaudeGlobalSkillsDir(), request.skillName);
  }
  const projectId = request.projectId;
  if (!projectId) throw new Error('projectId required for project scope');
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return join(project.projectPath, '.claude', 'skills', request.skillName);
}

ipcMain.handle(IPC_CHANNELS['eval:startRuns'], async (_, request: import('@nakiros/shared').StartEvalRunRequest) => {
  return startEvalRuns(request, {
    resolveSkillDir: resolveEvalSkillDir,
    onEvent: (event) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.webContents.send(IPC_CHANNELS['eval:event'], event);
    },
  });
});

ipcMain.handle(IPC_CHANNELS['eval:stopRun'], (_, runId: string) => {
  stopEvalRun(runId);
});

ipcMain.handle(IPC_CHANNELS['eval:listRuns'], () => listEvalRuns());

ipcMain.handle(IPC_CHANNELS['eval:loadPersisted'], (_, request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }) => {
  const skillDir = resolveEvalSkillDir(request as import('@nakiros/shared').StartEvalRunRequest);
  return loadPersistedRuns(skillDir);
});

function getDefinitionForRun(run: import('@nakiros/shared').SkillEvalRun): {
  skillDir: string;
  definition: import('@nakiros/shared').SkillEvalDefinition;
} {
  // Derive skillDir directly from the run's workdir: {skillDir}/evals/workspace/iteration-N/eval-X/config
  const marker = '/evals/workspace/';
  const idx = run.workdir.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot derive skill dir from workdir: ${run.workdir}`);
  const skillDir = run.workdir.slice(0, idx);

  const evalsJsonPath = join(skillDir, 'evals', 'evals.json');
  const rawEvals = JSON.parse(readFileSync(evalsJsonPath, 'utf8')) as {
    evals: Array<Record<string, unknown>>;
  };
  const match = rawEvals.evals.find((e) => e['name'] === run.evalName);
  if (!match) throw new Error(`Eval definition not found: ${run.evalName}`);

  const definition: import('@nakiros/shared').SkillEvalDefinition = {
    id: (match['id'] as number) ?? 0,
    name: (match['name'] as string) ?? '',
    prompt: (match['prompt'] as string) ?? '',
    expectedOutput: (match['expected_output'] as string) ?? '',
    mode: (match['mode'] as 'autonomous' | 'interactive') ?? 'autonomous',
    outputFiles: (match['output_files'] as string[]) ?? [],
    assertions: (match['assertions'] as import('@nakiros/shared').SkillEvalDefinition['assertions']) ?? [],
  };

  return { skillDir, definition };
}

ipcMain.handle(IPC_CHANNELS['eval:sendUserMessage'], async (_, runId: string, message: string) => {
  const run = getEvalRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const { skillDir, definition } = getDefinitionForRun(run);
  await sendEvalUserMessage(runId, message, skillDir, definition);
});

ipcMain.handle(IPC_CHANNELS['eval:finishRun'], async (_, runId: string) => {
  const run = getEvalRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const { definition } = getDefinitionForRun(run);
  await finishEvalWaitingRun(runId, definition);
});

ipcMain.handle(IPC_CHANNELS['eval:getFeedback'], (_, request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number }) => {
  const skillDir = resolveEvalSkillDir(request as import('@nakiros/shared').StartEvalRunRequest);
  return readIterationFeedback(skillDir, request.iteration);
});

ipcMain.handle(IPC_CHANNELS['eval:saveFeedback'], (_, request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number; evalName: string; feedback: string }) => {
  const skillDir = resolveEvalSkillDir(request as import('@nakiros/shared').StartEvalRunRequest);
  saveEvalFeedback(skillDir, request.iteration, request.evalName, request.feedback);
});

/**
 * List all files produced by a run under `{workdir}/outputs/`.
 * Recurses into subdirectories; returns flat list with relative paths.
 * Used by the UI to show the human reviewer what the agent generated.
 */
ipcMain.handle(IPC_CHANNELS['eval:listOutputs'], (_, runId: string): import('@nakiros/shared').EvalRunOutputEntry[] => {
  const run = getEvalRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const outputsDir = join(run.workdir, 'outputs');
  if (!existsSync(outputsDir)) return [];

  const { readdirSync, statSync } = require('fs') as typeof import('fs');
  const entries: import('@nakiros/shared').EvalRunOutputEntry[] = [];

  const walk = (dir: string): void => {
    let items: import('fs').Dirent[];
    try {
      items = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile()) {
        try {
          const s = statSync(full);
          entries.push({
            relativePath: full.slice(outputsDir.length + 1),
            sizeBytes: s.size,
            modifiedAt: s.mtime.toISOString(),
          });
        } catch {
          // ignore
        }
      }
    }
  };
  walk(outputsDir);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
});

/** Read an output file produced by a run. Path is sandboxed to `{workdir}/outputs/`. */
ipcMain.handle(IPC_CHANNELS['eval:readOutput'], (_, runId: string, relativePath: string): string | null => {
  const run = getEvalRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const outputsDir = join(run.workdir, 'outputs');
  const abs = resolve(outputsDir, relativePath);
  if (!abs.startsWith(outputsDir + '/') && abs !== outputsDir) {
    throw new Error('Path escapes outputs directory');
  }
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
});

// ─── Audit runner ───────────────────────────────────────────────────────────

function broadcastAuditEvent(event: import('@nakiros/shared').AuditRunEvent): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(IPC_CHANNELS['audit:event'], event);
}

ipcMain.handle(IPC_CHANNELS['audit:start'], (_, request: import('@nakiros/shared').StartAuditRequest) => {
  const skillDir = resolveEvalSkillDir(request as unknown as import('@nakiros/shared').StartEvalRunRequest);
  return startAudit(request, { skillDir, onEvent: broadcastAuditEvent });
});

ipcMain.handle(IPC_CHANNELS['audit:stopRun'], (_, runId: string) => {
  stopAudit(runId);
});

ipcMain.handle(IPC_CHANNELS['audit:getRun'], (_, runId: string) => getAuditRun(runId));

ipcMain.handle(IPC_CHANNELS['audit:sendUserMessage'], async (_, runId: string, message: string) => {
  const run = getAuditRun(runId);
  if (!run) throw new Error(`Audit run not found: ${runId}`);
  const skillDir = resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
  } as import('@nakiros/shared').StartEvalRunRequest);
  await sendAuditUserMessage(runId, message, { skillDir, onEvent: broadcastAuditEvent });
});

ipcMain.handle(IPC_CHANNELS['audit:listHistory'], (_, request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }) => {
  const skillDir = resolveEvalSkillDir(request as import('@nakiros/shared').StartEvalRunRequest);
  return listAuditHistory(skillDir);
});

ipcMain.handle(IPC_CHANNELS['audit:readReport'], (_, path: string) => readAuditReport(path));

ipcMain.handle(IPC_CHANNELS['audit:listActive'], () => listActiveAuditRuns());

// ─── Fix runner ─────────────────────────────────────────────────────────────

function broadcastFixEvent(event: import('@nakiros/shared').AuditRunEvent): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(IPC_CHANNELS['fix:event'], event);
}

ipcMain.handle(IPC_CHANNELS['fix:start'], (_, request: import('@nakiros/shared').StartAuditRequest) => {
  const skillDir = resolveEvalSkillDir(request as unknown as import('@nakiros/shared').StartEvalRunRequest);
  return startFix(request, { skillDir, onEvent: broadcastFixEvent });
});

ipcMain.handle(IPC_CHANNELS['fix:stopRun'], (_, runId: string) => {
  stopFix(runId);
});

ipcMain.handle(IPC_CHANNELS['fix:getRun'], (_, runId: string) => getFixRun(runId));

ipcMain.handle(IPC_CHANNELS['fix:sendUserMessage'], async (_, runId: string, message: string) => {
  const run = getFixRun(runId);
  if (!run) throw new Error(`Fix run not found: ${runId}`);
  const skillDir = resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
  } as import('@nakiros/shared').StartEvalRunRequest);
  await sendFixUserMessage(runId, message, { skillDir, onEvent: broadcastFixEvent });
});

ipcMain.handle(IPC_CHANNELS['fix:finish'], (_, runId: string) => {
  const run = getFixRun(runId);
  if (!run) throw new Error(`Fix run not found: ${runId}`);
  const skillDir = resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
  } as import('@nakiros/shared').StartEvalRunRequest);
  finishFix(runId, { skillDir, onEvent: broadcastFixEvent });
});

/**
 * Kick off a full eval batch against the fix's temp workdir (in-progress copy).
 * Each run writes results INSIDE the temp workdir — so the real skill's history
 * is untouched until the user clicks Sync. The fix agent can read
 * `./evals/workspace/iteration-N/benchmark.json` between turns.
 */
ipcMain.handle(IPC_CHANNELS['fix:runEvalsInTemp'], async (_, request: { runId: string; evalNames?: string[]; includeBaseline?: boolean }) => {
  const run = getFixRun(request.runId);
  if (!run) throw new Error(`Fix run not found: ${request.runId}`);
  const tempDir = getFixTempWorkdir(request.runId);
  if (!tempDir) throw new Error(`No temp workdir for fix ${request.runId}`);
  return startEvalRuns(
    {
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
      evalNames: request.evalNames,
      includeBaseline: request.includeBaseline,
      skillDirOverride: tempDir,
    },
    {
      resolveSkillDir: resolveEvalSkillDir,
      onEvent: (event) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.webContents.send(IPC_CHANNELS['eval:event'], event);
      },
    },
  );
});

ipcMain.handle(IPC_CHANNELS['fix:listActive'], () => listActiveFixRuns());

ipcMain.handle(IPC_CHANNELS['fix:getBufferedEvents'], (_, runId: string) => getFixBufferedEvents(runId));

/** Read the latest iteration benchmark from both the real skill and the fix temp workdir. */
ipcMain.handle(IPC_CHANNELS['fix:getBenchmarks'], (_, runId: string): import('@nakiros/shared').FixBenchmarks => {
  const realDir = getFixRealSkillDir(runId);
  const tempDir = getFixTempWorkdir(runId);
  return {
    real: realDir ? readLatestIterationBenchmark(realDir) : null,
    temp: tempDir ? readLatestIterationBenchmark(tempDir) : null,
  };
});

// ─── Create runner ──────────────────────────────────────────────────────────

function broadcastCreateEvent(event: import('@nakiros/shared').AuditRunEvent): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(IPC_CHANNELS['create:event'], event);
}

ipcMain.handle(IPC_CHANNELS['create:start'], (_, request: import('@nakiros/shared').StartAuditRequest) => {
  const skillDir = resolveEvalSkillDir(request as unknown as import('@nakiros/shared').StartEvalRunRequest);
  return startCreate(request, { skillDir, onEvent: broadcastCreateEvent });
});

ipcMain.handle(IPC_CHANNELS['create:stopRun'], (_, runId: string) => {
  stopCreate(runId);
});

ipcMain.handle(IPC_CHANNELS['create:getRun'], (_, runId: string) => getCreateRun(runId));

ipcMain.handle(IPC_CHANNELS['create:sendUserMessage'], async (_, runId: string, message: string) => {
  const run = getCreateRun(runId);
  if (!run) throw new Error(`Create run not found: ${runId}`);
  const skillDir = resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
  } as import('@nakiros/shared').StartEvalRunRequest);
  await sendCreateUserMessage(runId, message, { skillDir, onEvent: broadcastCreateEvent });
});

ipcMain.handle(IPC_CHANNELS['create:finish'], (_, runId: string) => {
  const run = getCreateRun(runId);
  if (!run) throw new Error(`Create run not found: ${runId}`);
  const skillDir = resolveEvalSkillDir({
    scope: run.scope,
    projectId: run.projectId,
    skillName: run.skillName,
  } as import('@nakiros/shared').StartEvalRunRequest);
  finishCreate(runId, { skillDir, onEvent: broadcastCreateEvent });
});

ipcMain.handle(IPC_CHANNELS['create:listActive'], () => listActiveCreateRuns());

ipcMain.handle(IPC_CHANNELS['create:getBufferedEvents'], (_, runId: string) => getCreateBufferedEvents(runId));

// ─── Draft files (shared by fix + create) ──────────────────────────────────
// The agent writes into the temp workdir. Let the UI list and preview what's
// there before the user clicks "Sync to skill" / "Create skill".

const TEMP_HIDDEN_PATHS = new Set(['.claude', 'run.json']); // Nakiros-internal, never shown

function shouldHideTempEntry(rel: string): boolean {
  for (const hidden of TEMP_HIDDEN_PATHS) {
    if (rel === hidden || rel.startsWith(hidden + '/')) return true;
  }
  // Skip runtime eval artifacts so the draft view stays focused on the skill itself.
  if (rel.startsWith('evals/workspace/')) return true;
  return false;
}

ipcMain.handle(
  IPC_CHANNELS['skillAgent:listTempFiles'],
  (_, runId: string): import('@nakiros/shared').SkillAgentTempFileEntry[] => {
    const tempDir = getFixTempWorkdir(runId);
    if (!tempDir || !existsSync(tempDir)) return [];

    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const entries: import('@nakiros/shared').SkillAgentTempFileEntry[] = [];

    const walk = (dir: string): void => {
      let items: import('fs').Dirent[];
      try {
        items = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
      } catch {
        return;
      }
      for (const item of items) {
        const full = join(dir, item.name);
        const rel = full.slice(tempDir.length + 1);
        if (shouldHideTempEntry(rel)) continue;
        if (item.isDirectory()) {
          walk(full);
        } else if (item.isFile()) {
          try {
            const s = statSync(full);
            entries.push({ relativePath: rel, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() });
          } catch {
            // ignore
          }
        }
      }
    };
    walk(tempDir);
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return entries;
  },
);

const TEMP_FILE_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

/** Max bytes we'll send as text content — above that we treat as opaque binary. */
const MAX_TEMP_TEXT_BYTES = 1_000_000;

ipcMain.handle(
  IPC_CHANNELS['skillAgent:readTempFile'],
  (_, runId: string, relativePath: string): import('@nakiros/shared').SkillAgentTempFileContent => {
    const tempDir = getFixTempWorkdir(runId);
    if (!tempDir) return { kind: 'missing' };
    const abs = resolve(tempDir, relativePath);
    if (!abs.startsWith(tempDir + '/') && abs !== tempDir) return { kind: 'missing' };
    if (shouldHideTempEntry(relativePath)) return { kind: 'missing' };
    if (!existsSync(abs)) return { kind: 'missing' };

    const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
    const imgMime = TEMP_FILE_IMAGE_MIME[ext];
    try {
      const stat = require('fs').statSync(abs) as import('fs').Stats;
      if (imgMime) {
        const buf = readFileSync(abs);
        return { kind: 'image', dataUrl: `data:${imgMime};base64,${buf.toString('base64')}` };
      }
      if (stat.size > MAX_TEMP_TEXT_BYTES) {
        return { kind: 'binary', sizeBytes: stat.size };
      }
      return { kind: 'text', content: readFileSync(abs, 'utf8') };
    } catch {
      return { kind: 'missing' };
    }
  },
);

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
