import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AgentProvider, StoredAgentTab, StoredAgentTabsState } from '@nakiros/shared';

type AgentTabsByWorkspace = Record<string, StoredAgentTabsState>;

const NAKIROS_DIR = join(homedir(), '.nakiros');
const STORE_PATH = join(NAKIROS_DIR, 'agent-tabs.json');

function ensureDir() {
  if (!existsSync(NAKIROS_DIR)) mkdirSync(NAKIROS_DIR, { recursive: true });
}

function normalizeProvider(value: unknown): AgentProvider {
  if (value === 'codex' || value === 'cursor' || value === 'claude') return value;
  return 'claude';
}

function toWorkspaceSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
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

  return {
    tabId: item['tabId'],
    conversationId: typeof item['conversationId'] === 'string' ? item['conversationId'] : undefined,
    workspaceId,
    workspaceSlug,
    workspaceName,
    mode: item['mode'] === 'repo' ? 'repo' : 'global',
    anchorRepoPath,
    activeRepoPaths,
    lastResolvedRepoMentions,
    repoPath,
    provider: normalizeProvider(item['provider']),
    title: typeof item['title'] === 'string' ? item['title'] : 'Nouvelle conversation',
    sessionId: typeof item['sessionId'] === 'string' ? item['sessionId'] : undefined,
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
