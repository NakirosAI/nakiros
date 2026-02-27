import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { HistoryMessage } from './claude-history.js';

interface CodexLogEntry {
  type?: string;
  payload?: Record<string, unknown>;
}

function findCodexSessionFile(sessionId: string): string | null {
  const root = join(homedir(), '.codex', 'sessions');
  if (!existsSync(root)) return null;

  const candidates: Array<{ path: string; mtimeMs: number }> = [];

  for (const year of readdirSync(root, { withFileTypes: true })) {
    if (!year.isDirectory()) continue;
    const yearPath = join(root, year.name);
    for (const month of readdirSync(yearPath, { withFileTypes: true })) {
      if (!month.isDirectory()) continue;
      const monthPath = join(yearPath, month.name);
      for (const day of readdirSync(monthPath, { withFileTypes: true })) {
        if (!day.isDirectory()) continue;
        const dayPath = join(monthPath, day.name);
        for (const file of readdirSync(dayPath, { withFileTypes: true })) {
          if (!file.isFile()) continue;
          if (!file.name.endsWith('.jsonl')) continue;
          if (!file.name.includes(`-${sessionId}.jsonl`)) continue;
          const fullPath = join(dayPath, file.name);
          candidates.push({ path: fullPath, mtimeMs: statSync(fullPath).mtimeMs });
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.path ?? null;
}

export function readCodexHistory(sessionId: string): HistoryMessage[] {
  const jsonlPath = findCodexSessionFile(sessionId);
  if (!jsonlPath) return [];

  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }

  const messages: HistoryMessage[] = [];
  const lines = raw.split('\n').filter(Boolean);

  for (const line of lines) {
    let entry: CodexLogEntry;
    try {
      entry = JSON.parse(line) as CodexLogEntry;
    } catch {
      continue;
    }

    if (entry.type !== 'event_msg') continue;
    const payloadType = entry.payload?.['type'];
    const payloadMessage = entry.payload?.['message'];
    if (payloadType === 'user_message' && typeof payloadMessage === 'string' && payloadMessage.trim()) {
      messages.push({ role: 'user', content: payloadMessage, tools: [] });
    } else if (payloadType === 'agent_message' && typeof payloadMessage === 'string' && payloadMessage.trim()) {
      messages.push({ role: 'agent', content: payloadMessage, tools: [] });
    }
  }

  // Deduplicate adjacent duplicates that can happen in some session logs.
  return messages.filter((msg, index) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    return !(prev?.role === msg.role && prev.content === msg.content);
  });
}
