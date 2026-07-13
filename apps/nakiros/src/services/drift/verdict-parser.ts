import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';

export type DriftVerdict = 'on-track' | 'drifting';

export interface TranscriptVerdict {
  verdict: DriftVerdict;
  /** Stable marker used to distinguish a fresh verdict from an older one. */
  marker: string;
}

const VERDICT_PATTERN = /<!--\s*nakiros-drift:\s*(on-track|drifting)\s*-->/gi;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function allowedRoot(provider: 'claude' | 'codex'): string {
  return provider === 'codex'
    ? join(homedir(), '.codex', 'sessions')
    : join(homedir(), '.claude', 'projects');
}

function isAllowedTranscript(filePath: string, provider: 'claude' | 'codex', root = allowedRoot(provider)): boolean {
  try {
    const file = realpathSync(filePath);
    const canonicalRoot = realpathSync(root);
    if (!file.endsWith('.jsonl')) return false;
    const child = relative(canonicalRoot, file);
    return child.length > 0 && !child.startsWith('..') && !isAbsolute(child);
  } catch {
    return false;
  }
}

function lastVerdict(text: string, markerPrefix: string): TranscriptVerdict | null {
  let latest: RegExpExecArray | null = null;
  VERDICT_PATTERN.lastIndex = 0;
  for (let match = VERDICT_PATTERN.exec(text); match; match = VERDICT_PATTERN.exec(text)) latest = match;
  if (!latest) return null;
  return {
    verdict: latest[1]!.toLowerCase() as DriftVerdict,
    marker: `${markerPrefix}:${latest.index}:${latest[0]}`,
  };
}

function textFromClaudeAssistant(entry: Record<string, unknown>): string {
  if (entry['type'] !== 'assistant' || entry['isMeta']) return '';
  const message = record(entry['message']);
  if (!Array.isArray(message['content'])) return '';
  return message['content']
    .map((item) => record(item))
    .filter((item) => item['type'] === 'text' && typeof item['text'] === 'string')
    .map((item) => item['text'] as string)
    .join('\n');
}

function textFromCodexAssistant(entry: Record<string, unknown>): string {
  const payload = record(entry['payload']);
  if (entry['type'] === 'event_msg' && payload['type'] === 'agent_message') {
    return typeof payload['message'] === 'string' ? payload['message'] : '';
  }
  if (entry['type'] !== 'response_item' || payload['type'] !== 'message' || payload['role'] !== 'assistant') {
    return '';
  }
  if (!Array.isArray(payload['content'])) return '';
  return payload['content']
    .map((item) => record(item))
    .map((item) => typeof item['text'] === 'string' ? item['text'] : '')
    .filter(Boolean)
    .join('\n');
}

/** Read the newest explicit Argos verdict emitted by an assistant. */
export function readLatestTranscriptVerdict(
  transcriptPath: string,
  provider: 'claude' | 'codex',
  rootOverride?: string,
): TranscriptVerdict | null {
  if (!isAllowedTranscript(transcriptPath, provider, rootOverride)) return null;
  let raw = '';
  try {
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }

  const lines = raw.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = record(JSON.parse(line) as unknown);
    } catch {
      continue;
    }
    const text = provider === 'codex'
      ? textFromCodexAssistant(entry)
      : textFromClaudeAssistant(entry);
    if (!text) continue;
    const verdict = lastVerdict(text, String(index));
    if (verdict) return verdict;
  }
  return null;
}
