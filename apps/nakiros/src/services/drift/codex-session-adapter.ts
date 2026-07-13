import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';

import type { ConversationMessage } from '@nakiros/shared';

import { parseCodexConversationFile } from '../codex-conversation-parser.js';
import type { PreparsedSessionData } from '../drift-analyzer.js';
import type { AssistantTurn, ToolUseEvent } from './session-loader.js';

const DEFAULT_CODEX_SESSIONS_ROOT = join(homedir(), '.codex', 'sessions');
const DEFAULT_CONTEXT_WINDOW = 200_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function canonicalPath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isInsideRoot(filePath: string, rootPath: string): boolean {
  const file = canonicalPath(filePath);
  const root = canonicalPath(rootPath);
  if (!file || !root || !file.endsWith('.jsonl')) return false;
  const child = relative(root, file);
  return child.length > 0 && !child.startsWith('..') && !isAbsolute(child);
}

function firstPatchedFile(patch: string): string | null {
  const match = patch.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/m);
  return match?.[1]?.trim() || null;
}

function normaliseTool(name: string, rawInput: unknown): { tool: string; input: Record<string, unknown> } {
  const input = record(rawInput);

  if (name === 'exec_command' || name === 'shell' || name === 'unified_exec') {
    return {
      tool: 'Bash',
      input: { ...input, command: input['cmd'] ?? input['command'] ?? '' },
    };
  }

  if (name === 'apply_patch') {
    const patch = typeof rawInput === 'string'
      ? rawInput
      : typeof input['patch'] === 'string'
        ? input['patch']
        : typeof input['input'] === 'string'
          ? input['input']
          : '';
    return {
      tool: 'Edit',
      input: { ...input, file_path: firstPatchedFile(patch) ?? input['file_path'] ?? '' },
    };
  }

  if (name === 'read_file' || name === 'view_image') {
    return {
      tool: 'Read',
      input: { ...input, file_path: input['file_path'] ?? input['path'] ?? '' },
    };
  }

  if (name === 'grep' || name === 'search') return { tool: 'Grep', input };
  if (name === 'glob') return { tool: 'Glob', input };
  return { tool: name, input };
}

function erroredCallIds(filePath: string): Set<string> {
  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return new Set();
  }

  const errors = new Set<string>();
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = record(JSON.parse(line) as unknown);
    } catch {
      continue;
    }
    if (entry['type'] !== 'response_item') continue;
    const payload = record(entry['payload']);
    const type = payload['type'];
    const callId = typeof payload['call_id'] === 'string' ? payload['call_id'] : null;
    if (!callId) continue;
    const status = payload['status'];
    if (status === 'failed' || status === 'error') errors.add(callId);
    if (type !== 'function_call_output' && type !== 'custom_tool_call_output') continue;
    const output = typeof payload['output'] === 'string' ? payload['output'] : '';
    const exitCode = output.match(/(?:^|\n)Exit code:\s*(-?\d+)/)?.[1];
    if (exitCode !== undefined && Number(exitCode) !== 0) errors.add(callId);
  }
  return errors;
}

function assistantTurns(messages: ConversationMessage[], errors: Set<string>): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  for (const message of messages) {
    const toolUses: ToolUseEvent[] = (message.toolUse ?? []).map((toolUse) => {
      const normalised = normaliseTool(toolUse.name, toolUse.input);
      return {
        ...normalised,
        hasError: errors.has(message.uuid),
        resultContent: '',
      };
    });
    if (message.type !== 'assistant') continue;
    turns.push({
      index: turns.length + 1,
      timestamp: message.timestamp,
      toolUses,
      text: message.content,
    });
  }
  return turns;
}

/**
 * Convert one native Codex rollout into the provider-neutral input consumed by
 * Argos' drift detectors. The hook-provided transcript path is accepted only
 * when it resolves below the Codex sessions directory.
 */
export function loadCodexDriftSession(
  transcriptPath: string,
  expectedSessionId: string,
  sessionsRoot = DEFAULT_CODEX_SESSIONS_ROOT,
): PreparsedSessionData | null {
  if (!isInsideRoot(transcriptPath, sessionsRoot)) return null;
  const parsed = parseCodexConversationFile(transcriptPath, 'argos-live');
  if (!parsed || parsed.conversation.sessionId !== expectedSessionId) return null;

  const userMessages = parsed.messages
    .filter((message) => message.type === 'user' && message.content.trim().length > 0)
    .map((message, index) => ({ index, timestamp: message.timestamp, text: message.content }));
  const samples = parsed.native.contextSamples;
  const maxContextTokens = samples.reduce((max, sample) => Math.max(max, sample.tokens), 0);
  const contextWindow = parsed.conversation.contextWindow ?? DEFAULT_CONTEXT_WINDOW;

  return {
    assistantTurns: assistantTurns(parsed.messages, erroredCallIds(transcriptPath)),
    userMessages,
    contextMetrics: { maxContextTokens, contextWindow },
  };
}
