import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { StoredConversation } from '@nakiros/shared';
import { listConversations, loadConversation, deleteConversation } from '@nakiros/orchestrator';
import type { ConversationMeta } from '@nakiros/orchestrator';

// ─── Stream reading ───────────────────────────────────────────────────────────

function conversationDir(workspaceSlug: string, conversationId: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'conversations', conversationId);
}

/**
 * Reads the conversation stream.ndjson and converts signal-only events to the
 * rawToUiMessages-compatible format expected by AgentPanel.
 */
function conversationStreamToRaw(workspaceSlug: string, conversationId: string): unknown[] {
  const path = join(conversationDir(workspaceSlug, conversationId), 'stream.ndjson');
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
  const raw: unknown[] = [];
  let pendingTextParts: Array<{ agentId: string; text: string }> = [];

  const flushPending = () => {
    if (pendingTextParts.length === 0) return;
    // Group consecutive text chunks from same agent into one message
    const groups: Array<{ agentId: string; chunks: string[] }> = [];
    for (const part of pendingTextParts) {
      const last = groups[groups.length - 1];
      if (last && last.agentId === part.agentId) {
        last.chunks.push(part.text);
      } else {
        groups.push({ agentId: part.agentId, chunks: [part.text] });
      }
    }
    for (const g of groups) {
      const combined = g.chunks.join('');
      const trimmed = combined.trim();
      if (trimmed) {
        raw.push({
          type: 'assistant',
          agentId: g.agentId,
          message: {
            content: [{ type: 'text', text: trimmed }],
          },
        });
      }
    }
    pendingTextParts = [];
  };

  for (const line of lines) {
    try {
      const evt = JSON.parse(line) as Record<string, unknown>;
      if (evt.type === 'user_message') {
        flushPending();
        raw.push({ type: 'user', content: evt.text as string });
      } else if (evt.type === 'text') {
        pendingTextParts.push({ agentId: evt.agentId as string, text: evt.text as string });
      }
      // runner_started, runner_done — skip
    } catch {
      // ignore malformed lines
    }
  }
  flushPending();
  return raw;
}

// ─── Mapping ConversationMeta → StoredConversation ────────────────────────────

function toStoredConversation(meta: ConversationMeta, workspaceId: string): StoredConversation {
  return {
    id: meta.id,
    sessionId: meta.id,                    // conv_xxx used as the resume identifier
    workspaceId,                           // real workspace UUID for frontend filtering
    workspaceSlug: meta.workspaceSlug,
    workspaceName: meta.workspaceSlug,
    mode: 'global',
    anchorRepoPath: meta.anchorRepoPath ?? '',
    activeRepoPaths: meta.additionalDirs,
    lastResolvedRepoMentions: [],
    repoPath: meta.anchorRepoPath ?? '',
    repoName: '',
    provider: 'claude',                    // default, actual per-runner provider stored in RunnerMeta
    participants: [],
    title: meta.title,
    agents: [],
    createdAt: meta.createdAt,
    lastUsedAt: meta.updatedAt,
    messages: conversationStreamToRaw(meta.workspaceSlug, meta.id),
  };
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function getConversations(workspaceSlug: string, workspaceId: string): StoredConversation[] {
  return listConversations(workspaceSlug).map((meta) => toStoredConversation(meta, workspaceId));
}

export function getConversation(workspaceSlug: string, workspaceId: string, conversationId: string): StoredConversation | null {
  const meta = loadConversation(workspaceSlug, conversationId);
  return meta ? toStoredConversation(meta, workspaceId) : null;
}

export function deleteConversationEntry(conversationId: string, workspaceSlug: string): void {
  deleteConversation(workspaceSlug, conversationId);
}
