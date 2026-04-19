/**
 * Browser-side Nakiros client.
 * Installs `window.nakiros` backed by HTTP (for `invoke`-style calls) and
 * WebSocket (for event streams). Must be imported before the React tree
 * calls any `window.nakiros.*` method.
 */

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

function subscribe(channel: string, cb: ChannelListener): () => void {
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
async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
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

const client = {
  // Shell (daemon) / clipboard (native)
  openPath: (path: string) => invoke('shell:openPath', path),
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
  getPreferences: () => invoke('preferences:get'),
  getSystemLanguage: () => invoke('preferences:getSystemLanguage'),
  savePreferences: (prefs: unknown) => invoke('preferences:save', prefs),

  // Agent installer
  getAgentInstallStatus: (repoPath: string) => invoke('agents:status', repoPath),
  installAgents: (request: unknown) => invoke('agents:install', request),
  getGlobalInstallStatus: () => invoke('agents:global-status'),
  getInstalledCommands: () => invoke('agents:installed-commands'),
  installAgentsGlobal: () => invoke('agents:install-global'),
  getAgentCliStatus: () => invoke('agents:cli-status'),

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
  nakirosConfigExists: () => invoke('onboarding:nakirosConfigExists'),
  onboardingDetectEditors: () => invoke('onboarding:detectEditors'),
  onboardingInstall: (editors: unknown[]) => invoke('onboarding:install', editors),
  onOnboardingProgress: (cb: (event: unknown) => void) => subscribe('onboarding:progress', cb),

  // Projects
  scanProjects: () => invoke('project:scan'),
  listProjects: () => invoke('project:list'),
  getProject: (id: string) => invoke('project:get', id),
  dismissProject: (id: string) => invoke('project:dismiss', id),
  listProjectConversations: (projectId: string) => invoke('project:listConversations', projectId),
  getProjectConversationMessages: (projectId: string, sessionId: string) =>
    invoke('project:getConversationMessages', projectId, sessionId),
  listProjectSkills: (projectId: string) => invoke('project:listSkills', projectId),
  getProjectSkill: (projectId: string, skillName: string) => invoke('project:getSkill', projectId, skillName),
  saveProjectSkill: (projectId: string, skillName: string, content: string) =>
    invoke('project:saveSkill', projectId, skillName, content),
  readSkillFile: (projectId: string, skillName: string, relativePath: string) =>
    invoke('project:readSkillFile', projectId, skillName, relativePath),
  saveSkillFile: (projectId: string, skillName: string, relativePath: string, content: string) =>
    invoke('project:saveSkillFile', projectId, skillName, relativePath, content),
  onScanProgress: (cb: (progress: unknown) => void) => subscribe('project:scanProgress', cb),

  // Nakiros bundled skills
  listBundledSkills: () => invoke('nakiros:listBundledSkills'),
  getBundledSkill: (skillName: string) => invoke('nakiros:getBundledSkill', skillName),
  readBundledSkillFile: (skillName: string, relativePath: string) =>
    invoke('nakiros:readBundledSkillFile', skillName, relativePath),
  saveBundledSkillFile: (skillName: string, relativePath: string, content: string) =>
    invoke('nakiros:saveBundledSkillFile', skillName, relativePath, content),
  promoteBundledSkill: (skillName: string) => invoke('nakiros:promoteBundledSkill', skillName),
  listBundledSkillConflicts: () => invoke('nakiros:listBundledSkillConflicts'),
  resolveBundledSkillConflict: (skillName: string, resolution: string) =>
    invoke('nakiros:resolveBundledSkillConflict', skillName, resolution),
  readBundledSkillConflictDiff: (skillName: string, relativePath: string) =>
    invoke('nakiros:readBundledSkillConflictDiff', skillName, relativePath),

  // Claude global skills
  listClaudeGlobalSkills: () => invoke('claudeGlobal:listSkills'),
  getClaudeGlobalSkill: (skillName: string) => invoke('claudeGlobal:getSkill', skillName),
  readClaudeGlobalSkillFile: (skillName: string, relativePath: string) =>
    invoke('claudeGlobal:readSkillFile', skillName, relativePath),
  saveClaudeGlobalSkillFile: (skillName: string, relativePath: string, content: string) =>
    invoke('claudeGlobal:saveSkillFile', skillName, relativePath, content),
  readSkillFileAsDataUrl: (request: unknown) => invoke('skill:readFileAsDataUrl', request),

  // Eval runner
  startEvalRuns: (request: unknown) => invoke('eval:startRuns', request),
  stopEvalRun: (runId: string) => invoke('eval:stopRun', runId),
  listEvalRuns: () => invoke('eval:listRuns'),
  loadPersistedEvalRuns: (request: unknown) => invoke('eval:loadPersisted', request),
  onEvalEvent: (cb: (event: unknown) => void) => subscribe('eval:event', cb),
  sendEvalUserMessage: (runId: string, message: string) => invoke('eval:sendUserMessage', runId, message),
  finishEvalRun: (runId: string) => invoke('eval:finishRun', runId),
  getEvalBufferedEvents: (runId: string) => invoke('eval:getBufferedEvents', runId),
  getEvalFeedback: (request: unknown) => invoke('eval:getFeedback', request),
  saveEvalFeedback: (request: unknown) => invoke('eval:saveFeedback', request),
  listEvalRunOutputs: (runId: string) => invoke('eval:listOutputs', runId),
  readEvalRunOutput: (runId: string, relativePath: string) => invoke('eval:readOutput', runId, relativePath),
  readEvalRunDiffPatch: (runId: string) => invoke('eval:readDiffPatch', runId),
  getEvalMatrix: (request: unknown) => invoke('eval:getMatrix', request),
  loadIterationRun: (request: unknown) => invoke('eval:loadIterationRun', request),

  // Audit
  startAudit: (request: unknown) => invoke('audit:start', request),
  stopAudit: (runId: string) => invoke('audit:stopRun', runId),
  getAuditRun: (runId: string) => invoke('audit:getRun', runId),
  sendAuditUserMessage: (runId: string, message: string) => invoke('audit:sendUserMessage', runId, message),
  finishAudit: (runId: string) => invoke('audit:finish', runId),
  listAuditHistory: (request: unknown) => invoke('audit:listHistory', request),
  readAuditReport: (path: string) => invoke('audit:readReport', path),
  listActiveAuditRuns: () => invoke('audit:listActive'),
  getAuditBufferedEvents: (runId: string) => invoke('audit:getBufferedEvents', runId),
  onAuditEvent: (cb: (event: unknown) => void) => subscribe('audit:event', cb),

  // Fix
  startFix: (request: unknown) => invoke('fix:start', request),
  stopFix: (runId: string) => invoke('fix:stopRun', runId),
  getFixRun: (runId: string) => invoke('fix:getRun', runId),
  sendFixUserMessage: (runId: string, message: string) => invoke('fix:sendUserMessage', runId, message),
  finishFix: (runId: string) => invoke('fix:finish', runId),
  runFixEvalsInTemp: (request: unknown) => invoke('fix:runEvalsInTemp', request),
  getFixBenchmarks: (runId: string) => invoke('fix:getBenchmarks', runId),
  listActiveFixRuns: () => invoke('fix:listActive'),
  getFixBufferedEvents: (runId: string) => invoke('fix:getBufferedEvents', runId),
  onFixEvent: (cb: (event: unknown) => void) => subscribe('fix:event', cb),
  listFixDiff: (runId: string) => invoke('fix:listDiff', runId),
  readFixDiffFile: (runId: string, relativePath: string) => invoke('fix:readDiffFile', runId, relativePath),

  // Create
  startCreate: (request: unknown) => invoke('create:start', request),
  stopCreate: (runId: string) => invoke('create:stopRun', runId),
  getCreateRun: (runId: string) => invoke('create:getRun', runId),
  sendCreateUserMessage: (runId: string, message: string) => invoke('create:sendUserMessage', runId, message),
  finishCreate: (runId: string) => invoke('create:finish', runId),
  listActiveCreateRuns: () => invoke('create:listActive'),
  getCreateBufferedEvents: (runId: string) => invoke('create:getBufferedEvents', runId),
  onCreateEvent: (cb: (event: unknown) => void) => subscribe('create:event', cb),
  listCreateDiff: (runId: string) => invoke('create:listDiff', runId),
  readCreateDiffFile: (runId: string, relativePath: string) => invoke('create:readDiffFile', runId, relativePath),

  // Meta
  getVersionInfo: (options?: { force?: boolean }) => invoke('meta:getVersionInfo', options ?? {}),

  // Skill agent temp files
  listSkillAgentTempFiles: (runId: string) => invoke('skillAgent:listTempFiles', runId),
  readSkillAgentTempFile: (runId: string, relativePath: string) => invoke('skillAgent:readTempFile', runId, relativePath),
};

// Install on window. We cast via `unknown` because the full type surface in
// global.d.ts contains many specific types we keep as `unknown` here —
// TypeScript will still catch usage mismatches at call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).nakiros = client;
