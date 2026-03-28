import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ArtifactContext, StoredAgentTab, StoredAgentTabsState } from '@nakiros/shared';
import { normalizeParticipants, normalizeProvider, toWorkspaceSlug } from './store-utils.js';

type AgentTabsByWorkspace = Record<string, StoredAgentTabsState>;

const NAKIROS_DIR = join(homedir(), '.nakiros');
const STORE_PATH = join(NAKIROS_DIR, 'agent-tabs.json');

function ensureDir() {
  if (!existsSync(NAKIROS_DIR)) mkdirSync(NAKIROS_DIR, { recursive: true });
}

function normalizeArtifactContext(raw: unknown): ArtifactContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const mode = item['mode'];
  const sourceSurface = item['sourceSurface'];
  const target = item['target'];
  const title = item['title'];

  if ((mode !== 'diff' && mode !== 'yolo') || !target || typeof target !== 'object') {
    return null;
  }

  const normalizedSourceSurface = sourceSurface === 'product' || sourceSurface === 'backlog'
    ? sourceSurface
    : 'chat';
  const targetItem = target as Record<string, unknown>;
  const kind = targetItem['kind'];

  if (kind === 'workspace_doc' && typeof targetItem['absolutePath'] === 'string') {
    return {
      target: {
        kind,
        absolutePath: targetItem['absolutePath'],
      },
      mode,
      sourceSurface: normalizedSourceSurface,
      title: typeof title === 'string' ? title : undefined,
    };
  }

  if (
    (kind === 'backlog_epic' || kind === 'backlog_story' || kind === 'backlog_task' || kind === 'backlog_sprint')
    && typeof targetItem['workspaceId'] === 'string'
    && typeof targetItem['id'] === 'string'
  ) {
    return {
      target: {
        kind,
        workspaceId: targetItem['workspaceId'],
        id: targetItem['id'],
      },
      mode,
      sourceSurface: normalizedSourceSurface,
      title: typeof title === 'string' ? title : undefined,
    };
  }

  return null;
}

function normalizeTab(raw: unknown, workspaceId: string): StoredAgentTab | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (typeof item['tabId'] !== 'string') return null;
  if (typeof item['repoPath'] !== 'string') return null;

  const workspaceName = typeof item['workspaceName'] === 'string'
    ? item['workspaceName']
    : workspaceId;
  const workspaceSlug = typeof item['workspaceSlug'] === 'string'
    ? item['workspaceSlug']
    : toWorkspaceSlug(workspaceName || workspaceId);
  const repoPath = item['repoPath'];
  const anchorRepoPath = typeof item['anchorRepoPath'] === 'string'
    ? item['anchorRepoPath']
    : repoPath;
  const activeRepoPaths = Array.isArray(item['activeRepoPaths'])
    ? item['activeRepoPaths'].filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    : (repoPath ? [repoPath] : []);
  const lastResolvedRepoMentions = Array.isArray(item['lastResolvedRepoMentions'])
    ? item['lastResolvedRepoMentions'].filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
    : [];
  const participants = normalizeParticipants(item['participants'], repoPath);

  return {
    tabId: item['tabId'],
    conversationId: typeof item['conversationId'] === 'string' ? item['conversationId'] : undefined,
    nakirosConversationId: typeof item['nakirosConversationId'] === 'string'
      ? item['nakirosConversationId']
      : undefined,
    workspaceId,
    workspaceSlug,
    workspaceName,
    mode: item['mode'] === 'repo' ? 'repo' : 'global',
    anchorRepoPath,
    activeRepoPaths,
    lastResolvedRepoMentions,
    repoPath,
    provider: normalizeProvider(item['provider']),
    participants,
    activeParticipantId: typeof item['activeParticipantId'] === 'string' ? item['activeParticipantId'] : undefined,
    title: typeof item['title'] === 'string' ? item['title'] : 'Nouvelle conversation',
    providerSessionId: typeof item['providerSessionId'] === 'string'
      ? item['providerSessionId']
      : (typeof item['sessionId'] === 'string' ? item['sessionId'] : undefined),
    sessionId: typeof item['providerSessionId'] === 'string'
      ? item['providerSessionId']
      : (typeof item['sessionId'] === 'string' ? item['sessionId'] : undefined),
    artifactContext: normalizeArtifactContext(item['artifactContext']),
  };
}

function normalizeState(raw: unknown, workspaceId: string): StoredAgentTabsState {
  if (!raw || typeof raw !== 'object') {
    return { workspaceId, activeTabId: null, tabs: [] };
  }
  const obj = raw as Record<string, unknown>;
  const tabs = Array.isArray(obj['tabs'])
    ? obj['tabs'].map((tab) => normalizeTab(tab, workspaceId)).filter(Boolean) as StoredAgentTab[]
    : [];
  const activeTabId = typeof obj['activeTabId'] === 'string' ? obj['activeTabId'] : null;
  return {
    workspaceId,
    activeTabId,
    tabs,
  };
}

function readAll(): AgentTabsByWorkspace {
  try {
    if (!existsSync(STORE_PATH)) return {};
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const source = parsed as Record<string, unknown>;
    const out: AgentTabsByWorkspace = {};
    for (const [workspaceId, state] of Object.entries(source)) {
      out[workspaceId] = normalizeState(state, workspaceId);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(data: AgentTabsByWorkspace): void {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function getAgentTabsState(workspaceId: string): StoredAgentTabsState | null {
  const all = readAll();
  return all[workspaceId] ?? null;
}

export function saveAgentTabsState(workspaceId: string, state: StoredAgentTabsState): void {
  const all = readAll();
  all[workspaceId] = normalizeState(state, workspaceId);
  writeAll(all);
}

export function clearAgentTabsState(workspaceId: string): void {
  const all = readAll();
  delete all[workspaceId];
  writeAll(all);
}
