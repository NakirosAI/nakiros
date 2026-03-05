import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AgentProvider, StoredConversation } from '@nakiros/shared';

const NAKIROS_DIR = join(homedir(), '.nakiros');

function workspaceSessionsDir(workspaceId: string): string {
  return join(NAKIROS_DIR, 'workspaces', workspaceId, 'sessions');
}

function sessionPath(workspaceId: string, id: string): string {
  return join(workspaceSessionsDir(workspaceId), `${id}.json`);
}

function ensureSessionsDir(workspaceId: string): void {
  const dir = workspaceSessionsDir(workspaceId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function normalizeConversation(raw: unknown): StoredConversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item['id'] !== 'string'
    || typeof item['sessionId'] !== 'string'
    || typeof item['workspaceId'] !== 'string'
    || typeof item['title'] !== 'string'
    || typeof item['createdAt'] !== 'string'
    || typeof item['lastUsedAt'] !== 'string'
  ) return null;

  const provider = item['provider'];
  const normalizedProvider: AgentProvider =
    provider === 'codex' || provider === 'cursor' || provider === 'claude' ? provider : 'claude';

  return {
    id: item['id'],
    sessionId: item['sessionId'],
    repoPath: typeof item['repoPath'] === 'string' ? item['repoPath'] : '',
    repoName: typeof item['repoName'] === 'string' ? item['repoName'] : '',
    provider: normalizedProvider,
    workspaceId: item['workspaceId'],
    title: item['title'],
    agents: Array.isArray(item['agents']) ? item['agents'].filter((a) => typeof a === 'string') : [],
    createdAt: item['createdAt'],
    lastUsedAt: item['lastUsedAt'],
    messages: Array.isArray(item['messages']) ? item['messages'] : [],
  };
}

function readSession(workspaceId: string, id: string): StoredConversation | null {
  try {
    const path = sessionPath(workspaceId, id);
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return normalizeConversation(parsed);
  } catch {
    return null;
  }
}

export function getConversations(workspaceId: string): StoredConversation[] {
  const dir = workspaceSessionsDir(workspaceId);
  if (!existsSync(dir)) return [];

  const sessions: StoredConversation[] = [];
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      const conv = readSession(workspaceId, id);
      if (conv) sessions.push(conv);
    }
  } catch {
    return [];
  }

  return sessions.sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

export function saveConversation(conv: StoredConversation, storageKey?: string): void {
  const key = storageKey ?? conv.workspaceId;
  ensureSessionsDir(key);
  const path = sessionPath(key, conv.id);
  writeFileSync(path, JSON.stringify(conv, null, 2), 'utf8');
}

export function deleteConversation(id: string, workspaceId: string): void {
  const path = sessionPath(workspaceId, id);
  if (existsSync(path)) {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}
