import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ChatTimelineEntry } from '@nakiros/shared';

const sessionPathCache = new Map<string, string>();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function textContent(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => text(record(part)?.['text']) ?? '')
    .filter(Boolean)
    .join('\n');
}

function reasoningSummary(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      const item = record(part);
      return text(item?.['text']) ?? text(item?.['summary_text']) ?? '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (record(value)) return record(value)!;
  if (typeof value !== 'string') return {};
  try {
    return record(JSON.parse(value) as unknown) ?? { input: value };
  } catch {
    return { input: value };
  }
}

function compactToolDisplay(name: string, input: unknown): string {
  const args = parseArguments(input);
  const raw = text(args['cmd']) ?? text(args['command']) ?? text(args['input']);
  if (!raw) return name;
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}…` : oneLine;
}

function isBootstrapPrompt(value: string): boolean {
  return value.includes('You are acting as the "nakiros-') && value.includes('--- BEGIN SKILL.md ---');
}

/** Parse a native Codex rollout into the runner-neutral chat timeline. */
export function parseCodexRunTimeline(raw: string): ChatTimelineEntry[] {
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return record(JSON.parse(line) as unknown);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const hasEventMessages = entries.some((entry) => {
    const payload = record(entry['payload']);
    return entry['type'] === 'event_msg' &&
      (payload?.['type'] === 'user_message' || payload?.['type'] === 'agent_message');
  });
  const out: ChatTimelineEntry[] = [];

  for (const entry of entries) {
    const ts = text(entry['timestamp']);
    const payload = record(entry['payload']);
    if (!ts || !payload) continue;
    const entryType = text(entry['type']);
    const payloadType = text(payload['type']);

    if (entryType === 'event_msg' && payloadType === 'user_message') {
      const message = text(payload['message']);
      if (message && !isBootstrapPrompt(message)) out.push({ kind: 'user', ts, text: message });
      continue;
    }
    if (entryType === 'event_msg' && payloadType === 'agent_message') {
      const message = text(payload['message']);
      if (!message) continue;
      out.push({
        kind: payload['phase'] === 'commentary' ? 'thinking' : 'assistant_text',
        ts,
        text: message,
      });
      continue;
    }
    if (entryType !== 'response_item') continue;

    if (payloadType === 'reasoning') {
      const summary = reasoningSummary(payload['summary']);
      if (summary) out.push({ kind: 'thinking', ts, text: summary });
      continue;
    }
    // Newer rollouts persist event_msg mirrors; only use response messages as
    // a fallback for older files to avoid rendering every message twice.
    if (!hasEventMessages && payloadType === 'message') {
      const role = text(payload['role']);
      const message = textContent(payload['content']);
      if (!message) continue;
      if (role === 'user' && !isBootstrapPrompt(message)) out.push({ kind: 'user', ts, text: message });
      if (role === 'assistant') {
        out.push({
          kind: payload['phase'] === 'commentary' ? 'thinking' : 'assistant_text',
          ts,
          text: message,
        });
      }
      continue;
    }
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const name = text(payload['name']) ?? 'Codex tool';
      out.push({
        kind: 'tool',
        ts,
        name,
        display: compactToolDisplay(name, payload['arguments'] ?? payload['input']),
      });
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

function findBelow(directory: string, suffix: string): string | null {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findBelow(path, suffix);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      return path;
    }
  }
  return null;
}

/** Read the persisted native rollout for a `codex exec` thread id. */
export function getCodexRunTimeline(
  sessionId: string,
  sessionsRoot = join(homedir(), '.codex', 'sessions'),
): ChatTimelineEntry[] {
  const cached = sessionPathCache.get(sessionId);
  const path = cached && existsSync(cached)
    ? cached
    : findBelow(sessionsRoot, `${sessionId}.jsonl`);
  if (!path) return [];
  sessionPathCache.set(sessionId, path);
  try {
    return parseCodexRunTimeline(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}
