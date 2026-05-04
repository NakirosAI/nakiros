/**
 * Browser-side Nakiros client.
 * Installs `window.nakiros` backed by HTTP (for `invoke`-style calls) and
 * WebSocket (for event streams). Must be imported before the React tree
 * calls any `window.nakiros.*` method.
 *
 * Every channel name flows through {@link IPC_CHANNELS} — no hardcoded
 * channel strings. Enforced by `CLAUDE.md`.
 */

import { IPC_CHANNELS, type IpcChannel } from '@nakiros/shared';

const HTTP_BASE = typeof window !== 'undefined' ? window.location.origin : '';
const WS_URL = HTTP_BASE.replace(/^http/, 'ws') + '/ws';

type ChannelListener = (payload: unknown) => void;

// ── WebSocket hub (singleton) ──────────────────────────────────────────────
const listeners = new Map<string, Set<ChannelListener>>();
let socket: WebSocket | null = null;
let reconnectAttempts = 0;

function ensureSocket(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  socket = new WebSocket(WS_URL);
  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
  });
  socket.addEventListener('message', (ev: MessageEvent) => {
    let msg: { channel?: string; payload?: unknown };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!msg.channel) return;
    const set = listeners.get(msg.channel);
    set?.forEach((fn) => {
      try {
        fn(msg.payload);
      } catch (err) {
        console.error('[nakiros-client] listener threw', err);
      }
    });
  });
  socket.addEventListener('close', () => {
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 10_000);
    reconnectAttempts++;
    setTimeout(ensureSocket, delay);
  });
  socket.addEventListener('error', () => {
    // `close` will fire after an error; reconnect logic lives there.
  });
}

function subscribe(channel: IpcChannel, cb: ChannelListener): () => void {
  ensureSocket();
  let set = listeners.get(channel);
  if (!set) {
    set = new Set();
    listeners.set(channel, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) listeners.delete(channel);
  };
}

// ── HTTP invoke ────────────────────────────────────────────────────────────
async function invoke<T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  const res = await fetch(`${HTTP_BASE}/ipc/${encodeURIComponent(channel)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  });
  if (res.status === 404) {
    throw new Error(`[nakiros-client] Unknown IPC channel: ${channel}`);
  }
  const body = (await res.json()) as { ok?: boolean; result?: T; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `IPC call failed: ${channel}`);
  }
  return body.result as T;
}

// ── Public `window.nakiros` surface ────────────────────────────────────────
// ── Native browser APIs ────────────────────────────────────────────────────
interface OpenAgentChatPayload {
  workspaceId?: string;
  conversationId?: string | null;
  tabId?: string | null;
  eventId?: string;
}

type NotifClickListener = (payload: OpenAgentChatPayload) => void;
const notifClickListeners = new Set<NotifClickListener>();

async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function emitNotifClick(payload: OpenAgentChatPayload): void {
  for (const fn of notifClickListeners) {
    try {
      fn(payload);
    } catch (err) {
      console.error('[nakiros-client] notif click listener threw', err);
    }
  }
}

const C = IPC_CHANNELS;

const client = {
  // Shell (daemon) / clipboard (native)
  openPath: (path: string) => invoke(C['shell:openPath'], path),
  writeClipboard: async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for non-secure contexts — rare but not zero.
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  },

  // Preferences
  getPreferences: () => invoke(C['preferences:get']),
  getSystemLanguage: () => invoke(C['preferences:getSystemLanguage']),
  savePreferences: (prefs: unknown) => invoke(C['preferences:save'], prefs),

  // Agent installer
  getAgentInstallStatus: (repoPath: string) => invoke(C['agents:status'], repoPath),
  installAgents: (request: unknown) => invoke(C['agents:install'], request),
  getGlobalInstallStatus: () => invoke(C['agents:global-status']),
  getInstalledCommands: () => invoke(C['agents:installed-commands']),
  installAgentsGlobal: () => invoke(C['agents:install-global']),
  getAgentCliStatus: () => invoke(C['agents:cli-status']),

  // Notifications (Web Notification API — no daemon roundtrip)
  showAgentRunNotification: async (payload: {
    workspaceId?: string;
    workspaceName?: string;
    conversationId?: string | null;
    tabId?: string | null;
    conversationTitle?: string;
    durationSeconds?: number;
  }): Promise<void> => {
    const allowed = await ensureNotificationPermission();
    if (!allowed) return;
    const title = payload.workspaceName ?? 'Nakiros';
    const suffix =
      typeof payload.durationSeconds === 'number' && payload.durationSeconds > 0
        ? ` (${
            payload.durationSeconds < 60
              ? `${payload.durationSeconds}s`
              : `${Math.round(payload.durationSeconds / 60)} min`
          })`
        : '';
    const body = payload.conversationTitle
      ? `${payload.conversationTitle} — terminé${suffix}`
      : `Run terminé${suffix}`;
    const notif = new Notification(title, { body });
    notif.onclick = () => {
      emitNotifClick({
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
        tabId: payload.tabId,
      });
      window.focus();
      notif.close();
    };
  },
  onOpenAgentRunChat: (cb: (payload: OpenAgentChatPayload) => void): (() => void) => {
    notifClickListeners.add(cb);
    return () => {
      notifClickListeners.delete(cb);
    };
  },

  // Onboarding
  nakirosConfigExists: () => invoke(C['onboarding:nakirosConfigExists']),
  onboardingDetectEditors: () => invoke(C['onboarding:detectEditors']),
  onboardingInstall: (editors: unknown[]) => invoke(C['onboarding:install'], editors),
  onOnboardingProgress: (cb: (event: unknown) => void) => subscribe(C['onboarding:progress'], cb),

  // Projects
  scanProjects: () => invoke(C['project:scan']),
  listProjects: () => invoke(C['project:list']),
  getProject: (id: string) => invoke(C['project:get'], id),
  dismissProject: (id: string) => invoke(C['project:dismiss'], id),
  listDismissedProjects: () => invoke(C['project:listDismissed']),
  undismissProject: (id: string) => invoke(C['project:undismiss'], id),
  listProjectConversations: (projectId: string) => invoke(C['project:listConversations'], projectId),
  getProjectConversationMessages: (projectId: string, sessionId: string) =>
    invoke(C['project:getConversationMessages'], projectId, sessionId),
  analyzeProjectConversation: (projectId: string, sessionId: string) =>
    invoke(C['project:analyzeConversation'], projectId, sessionId),
  listProjectConversationsWithAnalysis: (projectId: string) =>
    invoke(C['project:listConversationsWithAnalysis'], projectId),
  getProjectAggregate: (projectId: string) =>
    invoke(C['project:getAggregate'], projectId),
  refreshProjectAggregate: (projectId: string) =>
    invoke(C['project:refreshAggregate'], projectId),
  onProjectAggregateUpdated: (cb: (aggregate: unknown) => void) =>
    subscribe(C['project:aggregateUpdated'], cb),
  loadConversationDeepAnalysis: (projectId: string, sessionId: string) =>
    invoke(C['project:loadDeepAnalysis'], projectId, sessionId),
  deepAnalyzeConversation: (projectId: string, sessionId: string) =>
    invoke(C['project:deepAnalyzeConversation'], projectId, sessionId),
  getConversationDigest: (projectId: string, sessionId: string) =>
    invoke(C['project:getConversationDigest'], projectId, sessionId),
  listConversationDigests: (projectId: string) =>
    invoke(C['project:listConversationDigests'], projectId),
  listProjectSkills: (projectId: string) => invoke(C['project:listSkills'], projectId),
  getProjectSkill: (projectId: string, skillName: string) => invoke(C['project:getSkill'], projectId, skillName),
  saveProjectSkill: (projectId: string, skillName: string, content: string) =>
    invoke(C['project:saveSkill'], projectId, skillName, content),
  readSkillFile: (projectId: string, skillName: string, relativePath: string) =>
    invoke(C['project:readSkillFile'], projectId, skillName, relativePath),
  saveSkillFile: (projectId: string, skillName: string, relativePath: string, content: string) =>
    invoke(C['project:saveSkillFile'], projectId, skillName, relativePath, content),
  onScanProgress: (cb: (progress: unknown) => void) => subscribe(C['project:scanProgress'], cb),

  // Nakiros bundled skills
  listBundledSkills: () => invoke(C['nakiros:listBundledSkills']),
  getBundledSkill: (skillName: string) => invoke(C['nakiros:getBundledSkill'], skillName),
  readBundledSkillFile: (skillName: string, relativePath: string) =>
    invoke(C['nakiros:readBundledSkillFile'], skillName, relativePath),
  saveBundledSkillFile: (skillName: string, relativePath: string, content: string) =>
    invoke(C['nakiros:saveBundledSkillFile'], skillName, relativePath, content),
  promoteBundledSkill: (skillName: string) => invoke(C['nakiros:promoteBundledSkill'], skillName),
  listBundledSkillConflicts: () => invoke(C['nakiros:listBundledSkillConflicts']),
  resolveBundledSkillConflict: (skillName: string, resolution: string) =>
    invoke(C['nakiros:resolveBundledSkillConflict'], skillName, resolution),
  readBundledSkillConflictDiff: (skillName: string, relativePath: string) =>
    invoke(C['nakiros:readBundledSkillConflictDiff'], skillName, relativePath),

  // Claude global skills
  listClaudeGlobalSkills: () => invoke(C['claudeGlobal:listSkills']),
  getClaudeGlobalSkill: (skillName: string) => invoke(C['claudeGlobal:getSkill'], skillName),
  readClaudeGlobalSkillFile: (skillName: string, relativePath: string) =>
    invoke(C['claudeGlobal:readSkillFile'], skillName, relativePath),
  saveClaudeGlobalSkillFile: (skillName: string, relativePath: string, content: string) =>
    invoke(C['claudeGlobal:saveSkillFile'], skillName, relativePath, content),

  // Plugin skills (~/.claude/plugins/marketplaces/<mkt>/plugins/<plugin>/skills/)
  listPluginSkills: () => invoke(C['pluginSkills:list']),
  getPluginSkill: (marketplaceName: string, pluginName: string, skillName: string) =>
    invoke(C['pluginSkills:getSkill'], marketplaceName, pluginName, skillName),
  readPluginSkillFile: (
    marketplaceName: string,
    pluginName: string,
    skillName: string,
    relativePath: string,
  ) => invoke(C['pluginSkills:readSkillFile'], marketplaceName, pluginName, skillName, relativePath),
  savePluginSkillFile: (
    marketplaceName: string,
    pluginName: string,
    skillName: string,
    relativePath: string,
    content: string,
  ) =>
    invoke(
      C['pluginSkills:saveSkillFile'],
      marketplaceName,
      pluginName,
      skillName,
      relativePath,
      content,
    ),

  readSkillFileAsDataUrl: (request: unknown) => invoke(C['skill:readFileAsDataUrl'], request),

  // Eval runner
  startEvalRuns: (request: unknown) => invoke(C['eval:startRuns'], request),
  stopEvalRun: (runId: string) => invoke(C['eval:stopRun'], runId),
  listEvalRuns: () => invoke(C['eval:listRuns']),
  loadPersistedEvalRuns: (request: unknown) => invoke(C['eval:loadPersisted'], request),
  onEvalEvent: (cb: (event: unknown) => void) => subscribe(C['eval:event'], cb),
  sendEvalUserMessage: (runId: string, message: string) => invoke(C['eval:sendUserMessage'], runId, message),
  finishEvalRun: (runId: string) => invoke(C['eval:finishRun'], runId),
  getEvalBufferedEvents: (runId: string) => invoke(C['eval:getBufferedEvents'], runId),
  getEvalFeedback: (request: unknown) => invoke(C['eval:getFeedback'], request),
  saveEvalFeedback: (request: unknown) => invoke(C['eval:saveFeedback'], request),
  listEvalRunOutputs: (runId: string) => invoke(C['eval:listOutputs'], runId),
  readEvalRunOutput: (runId: string, relativePath: string) => invoke(C['eval:readOutput'], runId, relativePath),
  readEvalRunDiffPatch: (runId: string) => invoke(C['eval:readDiffPatch'], runId),
  getEvalMatrix: (request: unknown) => invoke(C['eval:getMatrix'], request),
  loadIterationRun: (request: unknown) => invoke(C['eval:loadIterationRun'], request),
  listEvalBaselines: (request: unknown) => invoke(C['eval:listBaselines'], request),
  getEvalTimeline: (runId: string) => invoke(C['eval:getTimeline'], runId),
  getEvalIterationUsage: (runId: string) => invoke(C['eval:getIterationUsage'], runId),
  getEvalBatchUsage: (runIds: string[]) => invoke(C['eval:getBatchUsage'], runIds),

  // Eval model comparison
  runModelComparison: (request: unknown) => invoke(C['comparison:run'], request),
  listModelComparisons: (request: unknown) => invoke(C['comparison:list'], request),
  getModelComparison: (request: unknown) => invoke(C['comparison:getMatrix'], request),
  getComparisonFingerprintStatus: (request: unknown) => invoke(C['comparison:getFingerprintStatus'], request),

  // Audit
  startAudit: (request: unknown) => invoke(C['audit:start'], request),
  stopAudit: (runId: string) => invoke(C['audit:stopRun'], runId),
  getAuditRun: (runId: string) => invoke(C['audit:getRun'], runId),
  sendAuditUserMessage: (runId: string, message: string) => invoke(C['audit:sendUserMessage'], runId, message),
  finishAudit: (runId: string) => invoke(C['audit:finish'], runId),
  listAuditHistory: (request: unknown) => invoke(C['audit:listHistory'], request),
  readAuditReport: (path: string) => invoke(C['audit:readReport'], path),
  listActiveAuditRuns: () => invoke(C['audit:listActive']),
  listAllAuditRuns: () => invoke(C['audit:listAll']),
  getAuditBufferedEvents: (runId: string) => invoke(C['audit:getBufferedEvents'], runId),
  getAuditTimeline: (runId: string) => invoke(C['audit:getTimeline'], runId),
  getAuditUsage: (runId: string) => invoke(C['audit:getUsage'], runId),
  onAuditEvent: (cb: (event: unknown) => void) => subscribe(C['audit:event'], cb),

  // Fix
  startFix: (request: unknown) => invoke(C['fix:start'], request),
  stopFix: (runId: string) => invoke(C['fix:stopRun'], runId),
  getFixRun: (runId: string) => invoke(C['fix:getRun'], runId),
  sendFixUserMessage: (runId: string, message: string) => invoke(C['fix:sendUserMessage'], runId, message),
  finishFix: (runId: string) => invoke(C['fix:finish'], runId),
  runFixEvalsInTemp: (request: unknown) => invoke(C['fix:runEvalsInTemp'], request),
  getFixBenchmarks: (runId: string) => invoke(C['fix:getBenchmarks'], runId),
  listActiveFixRuns: () => invoke(C['fix:listActive']),
  listAllFixRuns: () => invoke(C['fix:listAll']),
  getFixBufferedEvents: (runId: string) => invoke(C['fix:getBufferedEvents'], runId),
  onFixEvent: (cb: (event: unknown) => void) => subscribe(C['fix:event'], cb),
  listFixDiff: (runId: string) => invoke(C['fix:listDiff'], runId),
  readFixDiffFile: (runId: string, relativePath: string) => invoke(C['fix:readDiffFile'], runId, relativePath),
  getFixEditsHistory: (runId: string) => invoke(C['fix:getEditsHistory'], runId),
  getFixTimeline: (runId: string) => invoke(C['fix:getTimeline'], runId),
  getFixTempMatrix: (runId: string) => invoke(C['fix:getFixTempMatrix'], runId),
  getFixUsage: (runId: string) => invoke(C['fix:getUsage'], runId),

  // Create
  startCreate: (request: unknown) => invoke(C['create:start'], request),
  stopCreate: (runId: string) => invoke(C['create:stopRun'], runId),
  getCreateRun: (runId: string) => invoke(C['create:getRun'], runId),
  sendCreateUserMessage: (runId: string, message: string) => invoke(C['create:sendUserMessage'], runId, message),
  finishCreate: (runId: string) => invoke(C['create:finish'], runId),
  listActiveCreateRuns: () => invoke(C['create:listActive']),
  listAllCreateRuns: () => invoke(C['create:listAll']),
  getCreateBufferedEvents: (runId: string) => invoke(C['create:getBufferedEvents'], runId),
  onCreateEvent: (cb: (event: unknown) => void) => subscribe(C['create:event'], cb),
  listCreateDiff: (runId: string) => invoke(C['create:listDiff'], runId),
  readCreateDiffFile: (runId: string, relativePath: string) => invoke(C['create:readDiffFile'], runId, relativePath),
  getCreateTimeline: (runId: string) => invoke(C['create:getTimeline'], runId),
  getCreateUsage: (runId: string) => invoke(C['create:getUsage'], runId),
  runCreateEvals: (request: { runId: string; evalNames?: string[] }) =>
    invoke(C['create:runEvals'], request),

  // Meta
  getVersionInfo: (options?: { force?: boolean }) => invoke(C['meta:getVersionInfo'], options ?? {}),

  // Skill agent temp files
  listSkillAgentTempFiles: (runId: string) => invoke(C['skillAgent:listTempFiles'], runId),
  readSkillAgentTempFile: (runId: string, relativePath: string) => invoke(C['skillAgent:readTempFile'], runId, relativePath),


  // .claude/ configuration explorer (read-only V1)
  scanClaudeConfig: (projectId: string) => invoke(C['claudeConfig:scan'], projectId),
  readClaudeConfigFile: (projectId: string, relativePath: string) =>
    invoke(C['claudeConfig:readFile'], projectId, relativePath),

  // .claude/rules/ editor (Module 1 V2)
  listClaudeRules: (projectId: string) => invoke(C['claudeRules:list'], projectId),
  readClaudeRule: (projectId: string, name: string) =>
    invoke(C['claudeRules:read'], projectId, name),
  createClaudeRule: (projectId: string, request: { name: string; paths?: string[] }) =>
    invoke(C['claudeRules:create'], projectId, request),
  saveClaudeRule: (
    projectId: string,
    request: { name: string; paths: string[]; body: string; mtimeAtRead: string },
  ) => invoke(C['claudeRules:save'], projectId, request),
  deleteClaudeRule: (projectId: string, name: string) =>
    invoke(C['claudeRules:delete'], projectId, name),
  suggestClaudeRulePaths: (projectId: string) =>
    invoke(C['claudeRules:suggestPaths'], projectId),

  // .claude/agents/ editor (Module 2 V2)
  listClaudeAgents: (projectId: string) => invoke(C['claudeAgents:list'], projectId),
  readClaudeAgent: (projectId: string, name: string) =>
    invoke(C['claudeAgents:read'], projectId, name),
  createClaudeAgent: (projectId: string, request: { name: string; description?: string }) =>
    invoke(C['claudeAgents:create'], projectId, request),
  saveClaudeAgent: (
    projectId: string,
    request: { name: string; frontmatterRaw: string; body: string; mtimeAtRead: string },
  ) => invoke(C['claudeAgents:save'], projectId, request),
  deleteClaudeAgent: (projectId: string, name: string) =>
    invoke(C['claudeAgents:delete'], projectId, name),

  // .claude/output-styles/ editor (Module 3 V2)
  listClaudeOutputStyles: (projectId: string) =>
    invoke(C['claudeOutputStyles:list'], projectId),
  readClaudeOutputStyle: (projectId: string, name: string) =>
    invoke(C['claudeOutputStyles:read'], projectId, name),
  createClaudeOutputStyle: (
    projectId: string,
    request: { name: string; description?: string },
  ) => invoke(C['claudeOutputStyles:create'], projectId, request),
  saveClaudeOutputStyle: (
    projectId: string,
    request: {
      name: string;
      description: string;
      keepCodingInstructions: boolean;
      body: string;
      mtimeAtRead: string;
    },
  ) => invoke(C['claudeOutputStyles:save'], projectId, request),
  deleteClaudeOutputStyle: (projectId: string, name: string) =>
    invoke(C['claudeOutputStyles:delete'], projectId, name),

  // .claude/settings.json (+ .local) permissions editor (Module 4 V2)
  readClaudePermissions: (projectId: string, scope: 'project' | 'local') =>
    invoke(C['claudePermissions:read'], projectId, scope),
  saveClaudePermissions: (
    projectId: string,
    request: {
      scope: 'project' | 'local';
      allow: string[];
      deny: string[];
      ask: string[];
      defaultMode:
        | 'default'
        | 'acceptEdits'
        | 'auto'
        | 'dontAsk'
        | 'bypassPermissions'
        | 'plan'
        | null;
      rest: string;
      preservedJson: string;
      mtimeAtRead: string;
    },
  ) => invoke(C['claudePermissions:save'], projectId, request),

  // .mcp.json editor (Module 5 V2)
  listClaudeMcp: (projectId: string) => invoke(C['claudeMcp:list'], projectId),
  readClaudeMcpServer: (projectId: string, name: string) =>
    invoke(C['claudeMcp:read'], projectId, name),
  createClaudeMcpServer: (
    projectId: string,
    request: {
      name: string;
      transport: 'stdio' | 'http' | 'sse';
      command?: string;
      args?: string[];
      env?: Array<{ key: string; value: string }>;
      url?: string;
    },
  ) => invoke(C['claudeMcp:create'], projectId, request),
  saveClaudeMcpServer: (
    projectId: string,
    request: {
      name: string;
      newName?: string;
      transport: 'stdio' | 'http' | 'sse';
      command: string;
      args: string[];
      env: Array<{ key: string; value: string }>;
      url: string;
      headersJson: string;
      restJson: string;
      mtimeAtRead: string;
    },
  ) => invoke(C['claudeMcp:save'], projectId, request),
  deleteClaudeMcpServer: (projectId: string, name: string, mtimeAtRead: string) =>
    invoke(C['claudeMcp:delete'], projectId, name, mtimeAtRead),

  // .claude/settings.json hooks editor (Module 6 V2)
  readClaudeHooks: (projectId: string, scope: 'project' | 'local') =>
    invoke(C['claudeHooks:read'], projectId, scope),
  saveClaudeHooks: (
    projectId: string,
    request: {
      scope: 'project' | 'local';
      events: Array<{
        event:
          | 'SessionStart'
          | 'UserPromptSubmit'
          | 'PreToolUse'
          | 'PostToolUse'
          | 'Notification'
          | 'Stop'
          | 'SubagentStop'
          | 'SessionEnd';
        entries: Array<{ matcher: string; command: string; timeout: number | null }>;
      }>;
      preservedJson: string;
      mtimeAtRead: string;
    },
  ) => invoke(C['claudeHooks:save'], projectId, request),

  // CLAUDE.md editor (Module 7 V2) — root CLAUDE.md only
  listClaudeMd: (projectId: string) => invoke(C['claudeMd:list'], projectId),
  readClaudeMd: (projectId: string) => invoke(C['claudeMd:read'], projectId),
  saveClaudeMdFile: (
    projectId: string,
    request: { body: string; mtimeAtRead: string },
  ) => invoke(C['claudeMd:save'], projectId, request),
  deleteClaudeMd: (projectId: string) => invoke(C['claudeMd:delete'], projectId),

  // Conversation ingest (Phase A V1)
  getConversationIngestStatus: () => invoke(C['conversationIngest:status']),
  previewConversationIngestHookDiff: () => invoke(C['conversationIngest:previewHookDiff']),
  enableConversationIngest: () => invoke(C['conversationIngest:enable']),
  disableConversationIngest: () => invoke(C['conversationIngest:disable']),
  purgeConversationIngest: () => invoke(C['conversationIngest:purge']),
  runNowConversationIngest: () => invoke(C['conversationIngest:runNow']),
  listConversationIngestProjects: () => invoke(C['conversationIngest:listProjects']),
  listConversationIngestSessions: (projectPath?: string) =>
    invoke(C['conversationIngest:listSessions'], projectPath),
  onConversationIngestProgress: (cb: (event: unknown) => void) =>
    subscribe(C['conversationIngest:progress'], cb),

  // Conversation deep-analysis runner (analyze-convo)
  startAnalyzeConvo: (request: unknown) => invoke(C['analyzeConvo:start'], request),
  stopAnalyzeConvo: (runId: string) => invoke(C['analyzeConvo:stopRun'], runId),
  getAnalyzeConvoRun: (runId: string) => invoke(C['analyzeConvo:getRun'], runId),
  sendAnalyzeConvoUserMessage: (runId: string, message: string) =>
    invoke(C['analyzeConvo:sendUserMessage'], runId, message),
  finishAnalyzeConvo: (runId: string) => invoke(C['analyzeConvo:finish'], runId),
  listActiveAnalyzeConvoRuns: () => invoke(C['analyzeConvo:listActive']),
  listAllAnalyzeConvoRuns: () => invoke(C['analyzeConvo:listAll']),
  getAnalyzeConvoBufferedEvents: (runId: string) => invoke(C['analyzeConvo:getBufferedEvents'], runId),
  onAnalyzeConvoEvent: (cb: (event: unknown) => void) => subscribe(C['analyzeConvo:event'], cb),

  // CLAUDE.md audit history — archived runs under ~/.nakiros/<projectId>/claudemd/audit/
  listClaudemdAudits: (projectId: string) =>
    invoke(C['claudeMd:listAudits'], projectId),
  readClaudemdAudit: (path: string) => invoke(C['claudeMd:readAudit'], path),

  // Rules CRUD — project-scoped, recursive discovery under .claude/rules/
  listRules: (projectId: string) => invoke(C['rules:list'], projectId),
  readRule: (projectId: string, ruleName: string) =>
    invoke(C['rules:read'], projectId, ruleName),
  saveRule: (projectId: string, ruleName: string, content: string, mtimeAtRead: string) =>
    invoke(C['rules:save'], projectId, ruleName, content, mtimeAtRead),
  deleteRule: (projectId: string, ruleName: string) =>
    invoke(C['rules:delete'], projectId, ruleName),
  // Rules audit history — archived runs under ~/.nakiros/<projectId>/rules-audits/
  listRulesAudits: (projectId: string, ruleName: string) =>
    invoke(C['rules:listAudits'], projectId, ruleName),
  readRulesAudit: (path: string) => invoke(C['rules:readAudit'], path),

  // Subagents CRUD — project-scoped, recursive discovery under .claude/agents/
  listSubagents: (projectId: string) => invoke(C['subagents:list'], projectId),
  readSubagent: (projectId: string, subagentName: string) =>
    invoke(C['subagents:read'], projectId, subagentName),
  saveSubagent: (
    projectId: string,
    subagentName: string,
    content: string,
    mtimeAtRead: string,
  ) => invoke(C['subagents:save'], projectId, subagentName, content, mtimeAtRead),
  deleteSubagent: (projectId: string, subagentName: string) =>
    invoke(C['subagents:delete'], projectId, subagentName),
  // Subagents audit history — archived runs under
  // ~/.nakiros/<projectId>/subagents-audits/
  listSubagentsAudits: (projectId: string, subagentName: string) =>
    invoke(C['subagents:listAudits'], projectId, subagentName),
  readSubagentsAudit: (path: string) => invoke(C['subagents:readAudit'], path),

  // Hooks expert (nakiros-hooks-expert) — read/save the hooks block + audit
  // history. Distinct from readClaudeHooks/saveClaudeHooks (Module 6 V2 editor).
  readHooks: (projectId: string) => invoke(C['hooks:read'], projectId),
  saveHooks: (projectId: string, content: string, mtimeAtRead: string) =>
    invoke(C['hooks:save'], projectId, content, mtimeAtRead),
  listHooksAudits: (projectId: string) => invoke(C['hooks:listAudits'], projectId),
  readHooksAudit: (path: string) => invoke(C['hooks:readAudit'], path),

  // Permissions expert (nakiros-permissions-expert) — read/save the permissions
  // block + audit history. Distinct from Module 4 V2 claudePermissions:* editor.
  // All methods now accept a `scope` ('project' | 'local') to target either
  // settings.json or settings.local.json.
  readPermissions: (projectId: string, scope: string) =>
    invoke(C['permissions:read'], projectId, scope),
  savePermissions: (projectId: string, scope: string, content: string, mtimeAtRead: string) =>
    invoke(C['permissions:save'], projectId, scope, content, mtimeAtRead),
  listPermissionsAudits: (projectId: string, scope: string) =>
    invoke(C['permissions:listAudits'], projectId, scope),
  readPermissionsAudit: (path: string) => invoke(C['permissions:readAudit'], path),

  // MCP expert (nakiros-mcp-expert) — read/save the entire .mcp.json file +
  // audit history. Distinct from Module 5 V2 claudeMcp:* editor.
  readMcp: (projectId: string) => invoke(C['mcp:read'], projectId),
  saveMcp: (projectId: string, content: string, mtimeAtRead: string) =>
    invoke(C['mcp:save'], projectId, content, mtimeAtRead),
  listMcpAudits: (projectId: string) => invoke(C['mcp:listAudits'], projectId),
  readMcpAudit: (path: string) => invoke(C['mcp:readAudit'], path),

  // Conversation friction-classifier runner (classify-convo)
  startClassifyConvo: (request: unknown) => invoke(C['classifyConvo:start'], request),
  stopClassifyConvo: (runId: string) => invoke(C['classifyConvo:stopRun'], runId),
  getClassifyConvoRun: (runId: string) => invoke(C['classifyConvo:getRun'], runId),
  sendClassifyConvoUserMessage: (runId: string, message: string) =>
    invoke(C['classifyConvo:sendUserMessage'], runId, message),
  finishClassifyConvo: (runId: string) => invoke(C['classifyConvo:finish'], runId),
  listActiveClassifyConvoRuns: () => invoke(C['classifyConvo:listActive']),
  listAllClassifyConvoRuns: () => invoke(C['classifyConvo:listAll']),
  getClassifyConvoBufferedEvents: (runId: string) =>
    invoke(C['classifyConvo:getBufferedEvents'], runId),
  onClassifyConvoEvent: (cb: (event: unknown) => void) => subscribe(C['classifyConvo:event'], cb),
};

// Install on window. We cast via `unknown` because the full type surface in
// global.d.ts contains many specific types we keep as `unknown` here —
// TypeScript will still catch usage mismatches at call sites.
(window as unknown as { nakiros: typeof client }).nakiros = client;
