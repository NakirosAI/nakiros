import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

function readAll(): StoredConversation[] {
  try {
    if (!existsSync(STORE_PATH)) return [];
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StoredConversation[];
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
