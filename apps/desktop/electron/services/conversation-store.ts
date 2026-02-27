import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AgentProvider } from '@tiqora/shared';

export interface StoredMessage {
  role: 'user' | 'agent';
  content: string;
  tools: Array<{ name: string; display: string }>;
}

export interface StoredConversation {
  id: string;
  sessionId: string;
  repoPath: string;
  repoName: string;
  provider: AgentProvider;
  workspaceId?: string;
  title: string;       // first user message (truncated)
  createdAt: string;   // ISO
  lastUsedAt: string;  // ISO
  messages: StoredMessage[];
}

const TIQORA_DIR = join(homedir(), '.tiqora');
const STORE_PATH = join(TIQORA_DIR, 'conversations.json');
const MAX_CONVERSATIONS = 50;

function ensureDir() {
  if (!existsSync(TIQORA_DIR)) mkdirSync(TIQORA_DIR, { recursive: true });
}

function normalizeProvider(value: unknown): AgentProvider {
  if (value === 'codex' || value === 'cursor' || value === 'claude') return value;
  return 'claude';
}

function normalizeMessage(raw: unknown): StoredMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const role = item['role'];
  const content = item['content'];
  if ((role !== 'user' && role !== 'agent') || typeof content !== 'string') return null;
  const tools = Array.isArray(item['tools'])
    ? item['tools']
      .map((tool) => {
        if (!tool || typeof tool !== 'object') return null;
        const t = tool as Record<string, unknown>;
        if (typeof t['name'] !== 'string' || typeof t['display'] !== 'string') return null;
        return { name: t['name'], display: t['display'] };
      })
      .filter(Boolean) as Array<{ name: string; display: string }>
    : [];
  return { role, content, tools };
}

function normalizeConversation(raw: unknown): StoredConversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item['id'] !== 'string'
    || typeof item['sessionId'] !== 'string'
    || typeof item['repoPath'] !== 'string'
    || typeof item['repoName'] !== 'string'
    || typeof item['title'] !== 'string'
    || typeof item['createdAt'] !== 'string'
    || typeof item['lastUsedAt'] !== 'string'
  ) {
    return null;
  }

  const messages = Array.isArray(item['messages'])
    ? item['messages'].map(normalizeMessage).filter(Boolean) as StoredMessage[]
    : [];

  return {
    id: item['id'],
    sessionId: item['sessionId'],
    repoPath: item['repoPath'],
    repoName: item['repoName'],
    provider: normalizeProvider(item['provider']),
    workspaceId: typeof item['workspaceId'] === 'string' ? item['workspaceId'] : undefined,
    title: item['title'],
    createdAt: item['createdAt'],
    lastUsedAt: item['lastUsedAt'],
    messages,
  };
}

function readAll(): StoredConversation[] {
  try {
    if (!existsSync(STORE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConversation).filter(Boolean) as StoredConversation[];
  } catch {
    return [];
  }
}

function writeAll(conversations: StoredConversation[]) {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(conversations, null, 2), 'utf8');
}

export function getConversations(): StoredConversation[] {
  return readAll().sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

export function saveConversation(conv: StoredConversation): void {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    all[idx] = conv;
  } else {
    all.unshift(conv);
  }
  // Keep only the most recent MAX_CONVERSATIONS
  writeAll(all.slice(0, MAX_CONVERSATIONS));
}

export function deleteConversation(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}
