import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type {
  CodexCompaction,
  CodexContextSample,
  CodexAbortEvent,
  CodexToolStats,
  ConversationMessage,
  ProjectConversation,
} from '@nakiros/shared';

import { isCodexSubagentThreadSource } from './providers/codex-session.js';

interface CodexSessionMeta {
  id: string;
  cwd: string;
  cliVersion: string | null;
  gitBranch: string | null;
}

export interface ParsedCodexSession {
  conversation: ProjectConversation;
  messages: ConversationMessage[];
  native: {
    contextSamples: CodexContextSample[];
    compactions: CodexCompaction[];
    toolStats: Record<string, CodexToolStats>;
    turnDurationsMs: number[];
    abortedTurns: number;
    abortEvents: CodexAbortEvent[];
  };
}

function filesBelow(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesBelow(path);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
  });
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function samePath(a: string, b: string): boolean {
  const canonical = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  return canonical(a) === canonical(b);
}

function sessionMeta(entry: Record<string, unknown>): CodexSessionMeta | null {
  if (entry['type'] !== 'session_meta') return null;
  const payload = object(entry['payload']);
  const id = payload ? string(payload['id']) : null;
  const cwd = payload ? string(payload['cwd']) : null;
  if (!payload || !id || !cwd) return null;
  if (isCodexSubagentThreadSource(payload['thread_source'])) return null;
  const git = object(payload['git']);
  return {
    id,
    cwd,
    cliVersion: string(payload['cli_version']),
    gitBranch: git ? string(git['branch']) : null,
  };
}

function textFromContent(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      const item = object(part);
      if (!item) return '';
      return string(item['text']) ?? '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseToolInput(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Parse one native Codex rollout without routing it through Claude parsing. */
export function parseCodexConversationFile(
  filePath: string,
  projectId: string,
): ParsedCodexSession | null {
  let raw: string;
  let stat;
  try {
    raw = readFileSync(filePath, 'utf8');
    stat = statSync(filePath);
  } catch {
    return null;
  }

  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return object(JSON.parse(line) as unknown);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  // The first record owns the rollout identity. Forked/root rollouts may
  // append more session_meta records later; those must never reclassify it.
  const meta = entries[0] ? sessionMeta(entries[0]) : null;
  if (!meta) return null;

  const timestamps = entries.map((entry) => string(entry['timestamp'])).filter((v): v is string => v !== null);
  const startedAt = timestamps[0] ?? stat.birthtime.toISOString();
  const lastMessageAt = timestamps.at(-1) ?? stat.mtime.toISOString();
  const messages: ConversationMessage[] = [];
  const useResponseMessageFallback = !entries.some((entry) => {
    const payload = object(entry['payload']);
    return (
      entry['type'] === 'event_msg' &&
      (payload?.['type'] === 'user_message' || payload?.['type'] === 'agent_message')
    );
  });
  const toolsUsed = new Set<string>();
  let summary = '';
  let model: string | null = null;
  let toolErrorCount = 0;
  let tokenUsage: ProjectConversation['tokenUsage'];
  let contextWindow: number | null = null;
  const contextSamples: CodexContextSample[] = [];
  const compactions: CodexCompaction[] = [];
  const toolStats: Record<string, CodexToolStats> = {};
  const toolNameByCallId = new Map<string, string>();
  const erroredCallIds = new Set<string>();
  const turnDurationsMs: number[] = [];
  let abortedTurns = 0;
  const abortEvents: CodexAbortEvent[] = [];
  const denominator = Math.max(entries.length - 1, 1);
  const hasTopLevelCompaction = entries.some((entry) => entry['type'] === 'compacted');

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const payload = object(entry['payload']);
    if (!payload) continue;
    const timestamp = string(entry['timestamp']) ?? '';
    const payloadType = string(payload['type']);
    const offsetPct = index / denominator;

    if (
      entry['type'] === 'compacted' ||
      (!hasTopLevelCompaction &&
        entry['type'] === 'event_msg' &&
        payloadType === 'context_compacted')
    ) {
      compactions.push({ timestamp, offsetPct });
    }
    if (entry['type'] === 'event_msg' && payloadType === 'turn_aborted') {
      abortedTurns++;
      abortEvents.push({ timestamp, offsetPct });
    }
    if (entry['type'] === 'event_msg' && payloadType === 'task_complete') {
      const duration = number(payload['duration_ms']);
      if (duration !== null && duration >= 0) turnDurationsMs.push(duration);
    }

    if (entry['type'] === 'turn_context' && !model) model = string(payload['model']);
    if (entry['type'] === 'event_msg' && payloadType === 'task_started') {
      contextWindow = number(payload['model_context_window']) ?? contextWindow;
    }

    if (entry['type'] === 'event_msg' && payloadType === 'user_message') {
      const content = string(payload['message']) ?? '';
      if (!content.trim()) continue;
      if (!summary) summary = content.slice(0, 200);
      messages.push({
        uuid: `${meta.id}:${index}`,
        parentUuid: null,
        type: 'user',
        content,
        timestamp,
        isSidechain: false,
        provider: 'codex',
      });
    } else if (entry['type'] === 'event_msg' && payloadType === 'agent_message') {
      const content = string(payload['message']) ?? '';
      if (!content.trim()) continue;
      messages.push({
        uuid: `${meta.id}:${index}`,
        parentUuid: null,
        type: 'assistant',
        content,
        timestamp,
        isSidechain: false,
        provider: 'codex',
      });
    } else if (
      entry['type'] === 'response_item' &&
      (payloadType === 'function_call' || payloadType === 'custom_tool_call')
    ) {
      const name = string(payload['name']);
      if (!name) continue;
      toolsUsed.add(name);
      const callId = string(payload['call_id']) ?? `${meta.id}:${index}`;
      toolNameByCallId.set(callId, name);
      const stats = (toolStats[name] ??= { count: 0, errorCount: 0 });
      stats.count++;
      const status = string(payload['status']);
      if (status === 'failed' || status === 'error') {
        stats.errorCount++;
        toolErrorCount++;
        erroredCallIds.add(callId);
      }
      messages.push({
        uuid: callId,
        parentUuid: null,
        type: 'assistant',
        content: '',
        timestamp,
        isSidechain: false,
        toolUse: [{ name, input: parseToolInput(payload['arguments'] ?? payload['input']) }],
        provider: 'codex',
      });
    } else if (
      entry['type'] === 'response_item' &&
      (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output')
    ) {
      const output = string(payload['output']);
      const exitCode = output?.match(/(?:^|\n)Exit code:\s*(-?\d+)/)?.[1];
      const callId = string(payload['call_id']);
      if (exitCode !== undefined && Number(exitCode) !== 0 && (!callId || !erroredCallIds.has(callId))) {
        toolErrorCount++;
        if (callId) {
          erroredCallIds.add(callId);
          const toolName = toolNameByCallId.get(callId);
          if (toolName) (toolStats[toolName] ??= { count: 0, errorCount: 0 }).errorCount++;
        }
      }
    } else if (entry['type'] === 'event_msg' && payloadType === 'token_count') {
      const info = object(payload['info']);
      const total = info ? object(info['total_token_usage']) : null;
      if (!info || !total) continue;
      contextWindow = number(info['model_context_window']) ?? contextWindow;
      tokenUsage = {
        inputTokens: number(total['input_tokens']) ?? 0,
        cachedInputTokens: number(total['cached_input_tokens']) ?? 0,
        outputTokens: number(total['output_tokens']) ?? 0,
        reasoningOutputTokens: number(total['reasoning_output_tokens']) ?? 0,
        totalTokens: number(total['total_tokens']) ?? 0,
        ...(contextWindow !== null ? { contextWindow } : {}),
      };
      const last = object(info['last_token_usage']);
      const lastInput = last ? number(last['input_tokens']) : null;
      const cumulativeTotal = number(total['total_tokens']);
      if (lastInput !== null && cumulativeTotal !== null) {
        contextSamples.push({ timestamp, offsetPct, tokens: lastInput, totalTokens: cumulativeTotal });
      }
    } else if (
      entry['type'] === 'response_item' &&
      payloadType === 'message' &&
      useResponseMessageFallback
    ) {
      // Very old rollouts can omit event_msg mirrors. Only use response_item
      // messages as a fallback to avoid duplicate modern messages.
      const role = string(payload['role']);
      if (role !== 'user' && role !== 'assistant') continue;
      const content = textFromContent(payload['content']);
      if (!content.trim()) continue;
      if (role === 'user' && !summary) summary = content.slice(0, 200);
      messages.push({
        uuid: `${meta.id}:${index}`,
        parentUuid: null,
        type: role,
        content,
        timestamp,
        isSidechain: false,
        provider: 'codex',
      });
    }
  }

  return {
    conversation: {
      sessionId: meta.id,
      projectId,
      startedAt,
      lastMessageAt,
      messageCount: messages.filter((message) => message.content.trim()).length,
      toolsUsed: Array.from(toolsUsed),
      gitBranch: meta.gitBranch,
      cwd: meta.cwd,
      claudeVersion: null,
      summary: summary || '(no summary)',
      provider: 'codex',
      model,
      durationMs: Math.max(0, new Date(lastMessageAt).getTime() - new Date(startedAt).getTime()),
      ...(contextWindow !== null ? { contextWindow } : {}),
      toolErrorCount,
      ...(tokenUsage ? { tokenUsage } : {}),
    },
    messages,
    native: { contextSamples, compactions, toolStats, turnDurationsMs, abortedTurns, abortEvents },
  };
}

export function listCodexConversations(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
): ProjectConversation[] {
  return listParsedCodexConversations(sessionsDir, projectPath, projectId).map(
    (session) => session.conversation,
  );
}

export function listParsedCodexConversations(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
): ParsedCodexSession[] {
  if (!existsSync(sessionsDir)) return [];
  return filesBelow(sessionsDir)
    .map((file) => parseCodexConversationFile(file, projectId))
    .filter(
      (session): session is ParsedCodexSession =>
        session !== null && samePath(session.conversation.cwd, projectPath),
    )
    .sort(
      (a, b) =>
        new Date(b.conversation.lastMessageAt).getTime() -
        new Date(a.conversation.lastMessageAt).getTime(),
    );
}

export function getCodexConversationMessages(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
  sessionId: string,
): ConversationMessage[] | null {
  return getParsedCodexConversation(sessionsDir, projectPath, projectId, sessionId)?.messages ?? null;
}

export function getParsedCodexConversation(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
  sessionId: string,
): ParsedCodexSession | null {
  for (const file of filesBelow(sessionsDir)) {
    const parsed = parseCodexConversationFile(file, projectId);
    if (
      parsed &&
      samePath(parsed.conversation.cwd, projectPath) &&
      parsed.conversation.sessionId === sessionId
    ) {
      return parsed;
    }
  }
  return null;
}
