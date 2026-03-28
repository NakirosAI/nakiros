import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AgentProvider, CliEvent } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMeta {
  id: string;                    // conv_xxx
  workspaceSlug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'error';
  anchorRepoPath?: string;
  additionalDirs: string[];
}

export interface RunnerMeta {
  agentId: string;               // 'nakiros', 'architect', 'pm', etc.
  provider: AgentProvider;
  agentSessionId?: string;       // claude UUID or codex thread ID (for --resume)
  conversationCursor: number;    // last event index read from conversation stream
  status: 'running' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
}

// Signal-only events written to the conversation stream
export type ConversationEvent =
  | { type: 'text'; agentId: string; text: string }
  | { type: 'user_message'; text: string }
  | { type: 'runner_started'; agentId: string; provider: AgentProvider }
  | { type: 'runner_done'; agentId: string; exitCode: number };

// ─── Paths ────────────────────────────────────────────────────────────────────

function conversationsDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'conversations');
}

function conversationDir(workspaceSlug: string, conversationId: string): string {
  return join(conversationsDir(workspaceSlug), conversationId);
}

function runnerDir(workspaceSlug: string, conversationId: string, agentId: string): string {
  return join(conversationDir(workspaceSlug, conversationId), 'runners', agentId);
}

// ─── ID generation ────────────────────────────────────────────────────────────

function generateConversationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `conv_${ts}_${rand}`;
}

export function isNakirosConversationId(id: string): boolean {
  return id.startsWith('conv_');
}

// ─── Title ────────────────────────────────────────────────────────────────────

function titleFromMessage(message: string): string {
  const cleaned = message.trim();
  return cleaned.length > 72 ? cleaned.slice(0, 72) + '…' : cleaned;
}

// ─── Conversation CRUD ────────────────────────────────────────────────────────

export function createConversation(opts: {
  workspaceSlug: string;
  message: string;
  anchorRepoPath?: string;
  additionalDirs?: string[];
}): ConversationMeta {
  const id = generateConversationId();
  const now = new Date().toISOString();
  const meta: ConversationMeta = {
    id,
    workspaceSlug: opts.workspaceSlug,
    title: titleFromMessage(opts.message),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    anchorRepoPath: opts.anchorRepoPath,
    additionalDirs: opts.additionalDirs ?? [],
  };
  const dir = conversationDir(opts.workspaceSlug, id);
  mkdirSync(join(dir, 'runners'), { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export function loadConversation(workspaceSlug: string, conversationId: string): ConversationMeta | null {
  try {
    const path = join(conversationDir(workspaceSlug, conversationId), 'meta.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as ConversationMeta;
  } catch {
    return null;
  }
}

export function updateConversationMeta(
  workspaceSlug: string,
  conversationId: string,
  patch: Partial<ConversationMeta>,
): void {
  const meta = loadConversation(workspaceSlug, conversationId);
  if (!meta) return;
  const updated: ConversationMeta = { ...meta, ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(
    join(conversationDir(workspaceSlug, conversationId), 'meta.json'),
    JSON.stringify(updated, null, 2),
    'utf8',
  );
}

export function listConversations(workspaceSlug: string): ConversationMeta[] {
  const dir = conversationsDir(workspaceSlug);
  if (!existsSync(dir)) return [];
  const conversations: ConversationMeta[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = loadConversation(workspaceSlug, entry.name);
    if (meta) conversations.push(meta);
  }
  return conversations.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function deleteConversation(workspaceSlug: string, conversationId: string): void {
  const dir = conversationDir(workspaceSlug, conversationId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// ─── Runner CRUD ──────────────────────────────────────────────────────────────

export function createRunner(
  workspaceSlug: string,
  conversationId: string,
  agentId: string,
  provider: AgentProvider,
): RunnerMeta {
  const now = new Date().toISOString();
  const meta: RunnerMeta = {
    agentId,
    provider,
    conversationCursor: 0,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };
  const dir = runnerDir(workspaceSlug, conversationId, agentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export function loadRunner(
  workspaceSlug: string,
  conversationId: string,
  agentId: string,
): RunnerMeta | null {
  try {
    const path = join(runnerDir(workspaceSlug, conversationId, agentId), 'meta.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as RunnerMeta;
  } catch {
    return null;
  }
}

export function updateRunnerMeta(
  workspaceSlug: string,
  conversationId: string,
  agentId: string,
  patch: Partial<RunnerMeta>,
): void {
  const meta = loadRunner(workspaceSlug, conversationId, agentId);
  if (!meta) return;
  const updated: RunnerMeta = { ...meta, ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(
    join(runnerDir(workspaceSlug, conversationId, agentId), 'meta.json'),
    JSON.stringify(updated, null, 2),
    'utf8',
  );
}

// ─── Event persistence ────────────────────────────────────────────────────────

// Raw runner stream — full, includes tool calls, greps, everything
export function appendRunnerEvent(
  workspaceSlug: string,
  conversationId: string,
  agentId: string,
  event: CliEvent,
): void {
  const dir = runnerDir(workspaceSlug, conversationId, agentId);
  if (!existsSync(dir)) return;
  appendFileSync(join(dir, 'stream.ndjson'), JSON.stringify(event) + '\n', 'utf8');
}

// Signal-only conversation stream — shared between agents
export function appendConversationEvent(
  workspaceSlug: string,
  conversationId: string,
  event: ConversationEvent,
): void {
  const dir = conversationDir(workspaceSlug, conversationId);
  if (!existsSync(dir)) return;
  appendFileSync(join(dir, 'stream.ndjson'), JSON.stringify(event) + '\n', 'utf8');
}

// Read conversation stream delta from a cursor position
export function readConversationDelta(
  workspaceSlug: string,
  conversationId: string,
  fromCursor: number,
): { events: ConversationEvent[]; newCursor: number } {
  const path = join(conversationDir(workspaceSlug, conversationId), 'stream.ndjson');
  if (!existsSync(path)) return { events: [], newCursor: fromCursor };
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
  const slice = lines.slice(fromCursor);
  const events: ConversationEvent[] = [];
  for (const line of slice) {
    try {
      events.push(JSON.parse(line) as ConversationEvent);
    } catch {
      // ignore malformed lines
    }
  }
  return { events, newCursor: lines.length };
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

// Find a conversation by agentSessionId + agentId (for resume when renderer passes claude UUID)
export function findConversationByAgentSessionId(
  workspaceSlug: string,
  agentId: string,
  agentSessionId: string,
): ConversationMeta | null {
  const conversations = listConversations(workspaceSlug);
  for (const conv of conversations) {
    const runner = loadRunner(workspaceSlug, conv.id, agentId);
    if (runner?.agentSessionId === agentSessionId) return conv;
  }
  return null;
}
