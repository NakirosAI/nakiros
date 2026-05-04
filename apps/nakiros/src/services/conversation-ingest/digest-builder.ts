import type { ConversationMessage } from '@nakiros/shared';

/**
 * Compress a parsed Claude Code conversation into a dense, LLM-friendly text
 * digest. The digest preserves all semantic signal (user + assistant text in
 * full) but collapses tool calls into one-line summaries — a 30-turn session
 * goes from ~80k raw tokens to ~3-5k digest tokens.
 *
 * Used by the V1.1 friction classifier (Haiku 4.5) and consumable by future
 * cross-conversation aggregation.
 */

/** Threshold above which we mark a temporal gap between adjacent turns. */
const GAP_THRESHOLD_MS = 5 * 60 * 1000;
/** Bash commands longer than this are truncated in the digest. */
const BASH_CMD_MAX = 80;
/** Tool input field values longer than this are truncated. */
const TOOL_ARG_MAX = 60;

/**
 * Build the dense digest. Returns one string ready to be embedded into a
 * `<digest>` block by the classifier prompt builder.
 */
export function buildConversationDigest(messages: ConversationMessage[]): string {
  const lines: string[] = [];
  let prevTimestampMs: number | null = null;

  messages.forEach((msg, idx) => {
    const turnNum = idx + 1;
    const timestampMs = msg.timestamp ? Date.parse(msg.timestamp) : NaN;

    if (prevTimestampMs !== null && Number.isFinite(timestampMs)) {
      const gapMs = timestampMs - prevTimestampMs;
      if (gapMs >= GAP_THRESHOLD_MS) {
        lines.push(`[gap ${formatGap(gapMs)}]`);
      }
    }

    const role = roleLabel(msg.type);
    const time = formatTime(msg.timestamp);
    lines.push(`[T${turnNum} ${time} ${role}]`);

    const text = msg.content?.trim();
    if (text) {
      const prefix = msg.type === 'user' ? '> ' : '';
      lines.push(prefix + text);
    }

    if (msg.toolUse) {
      for (const tool of msg.toolUse) {
        lines.push(formatToolCall(tool.name, tool.input));
      }
    }

    lines.push('');

    if (Number.isFinite(timestampMs)) prevTimestampMs = timestampMs;
  });

  return lines.join('\n').trim();
}

function roleLabel(type: ConversationMessage['type']): string {
  if (type === 'user') return 'user';
  if (type === 'assistant') return 'asst';
  return type;
}

function formatTime(iso: string): string {
  if (!iso) return '?';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '?';
  return date.toISOString().slice(11, 19);
}

function formatGap(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h${remainder}min`;
}

function formatToolCall(name: string, input: unknown): string {
  const args = formatToolArgs(name, input);
  return args ? `${name}(${args})` : `${name}()`;
}

function formatToolArgs(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;

  switch (name) {
    case 'Read':
    case 'Write':
    case 'NotebookEdit':
      return shortPath(obj['file_path'] ?? obj['notebook_path']);
    case 'Edit': {
      const path = shortPath(obj['file_path']);
      const replaceAll = obj['replace_all'] === true ? ', replace_all' : '';
      return `${path}${replaceAll}`;
    }
    case 'Bash':
      return truncate(obj['command'], BASH_CMD_MAX);
    case 'Glob':
    case 'Grep':
      return truncate(obj['pattern'], TOOL_ARG_MAX);
    case 'WebFetch':
    case 'WebSearch':
      return truncate(obj['url'] ?? obj['query'], TOOL_ARG_MAX);
    case 'Task':
    case 'Agent': {
      const desc = truncate(obj['description'], TOOL_ARG_MAX);
      const subtype = obj['subagent_type'] ?? obj['type'];
      return subtype ? `${subtype}: ${desc}` : desc;
    }
    case 'TodoWrite':
      return Array.isArray(obj['todos']) ? `${(obj['todos'] as unknown[]).length} todos` : '';
    case 'Skill':
      return String(obj['skill'] ?? '');
    default: {
      // Fallback: pick the first scalar field (path-like or string-like).
      const candidate = Object.entries(obj).find(
        ([, v]) => typeof v === 'string' || typeof v === 'number',
      );
      if (!candidate) return '';
      const [key, value] = candidate;
      return `${key}=${truncate(value, TOOL_ARG_MAX)}`;
    }
  }
}

function shortPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Keep the last 3 path segments to stay readable but compact.
  const parts = value.split('/').filter(Boolean);
  if (parts.length <= 3) return value;
  return '…/' + parts.slice(-3).join('/');
}

function truncate(value: unknown, max: number): string {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/**
 * Char-count → token estimate (3 chars/token, intentional slight over-estimate
 * to err on the safe side of model windows). Mirrors `estimatePromptTokens` in
 * `conversation-deep-analyzer.ts` so model routing stays consistent.
 */
export function estimateDigestTokens(digest: string): number {
  return Math.ceil(digest.length / 3);
}
