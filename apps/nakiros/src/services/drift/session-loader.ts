/**
 * Resolves a Claude Code session ID to structured data extracted from its
 * JSONL file. Used by drift detectors that need raw activity without loading
 * the full conversation analysis pipeline.
 *
 * Exposes two public loaders:
 *   - {@link loadSessionTurns} — assistant turns with tool-use events (loop detector)
 *   - {@link loadUserMessages} — text of real user messages (topic detector)
 *
 * Strategy: scan every project directory under `~/.claude/projects/` looking
 * for `<sessionId>.jsonl`. Claude Code stores one JSONL per session in the
 * directory that matches the cwd the claude CLI was invoked from. We don't
 * know the cwd at call time, so we search all project dirs — the session ID is
 * globally unique so there can be at most one match.
 *
 * Performance note: scanning happens at most once per Stop-hook invocation
 * (typically < 1 s on a normal project list). No caching — callers are
 * assumed to be infrequent.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Context window metrics extracted directly from a session JSONL, used by the
 * context drift detector. No analysis cache is required — this is a lightweight
 * single-pass scan.
 */
export interface ContextMetrics {
  /**
   * Peak value of `input + cache_read + cache_creation` across all assistant
   * turns in the session. Mirrors the `maxContextTokens` computed by
   * `conversation-analyzer.ts`.
   */
  maxContextTokens: number;
  /**
   * Inferred context window for the model used in this session (200 k for
   * standard Sonnet/Haiku, 1 M when the peak exceeded 250 k).
   */
  contextWindow: number;
}

/**
 * A single user message extracted from a JSONL session, containing only real
 * user text (tool_result blocks are excluded). Used by the topic detector.
 */
export interface UserMessage {
  /**
   * 0-based index of this user message among all real user messages in the
   * session (after filtering out isMeta and tool_result-only entries).
   */
  index: number;
  /** ISO timestamp of the user message entry. */
  timestamp: string;
  /**
   * Plain text of the user message. May contain multiple text blocks
   * concatenated with a newline when the message had several text parts.
   */
  text: string;
}

/**
 * A single tool-use record extracted from one assistant turn in a JSONL
 * session, paired with whether the immediately following tool_result was an
 * error. Used as the atomic unit for loop detection.
 */
export interface ToolUseEvent {
  /** The tool name as reported by Claude Code (e.g. "Edit", "Bash", "Read"). */
  tool: string;
  /**
   * The raw tool input object. Callers should access well-known keys
   * (`file_path`, `command`, `pattern`) defensively.
   */
  input: Record<string, unknown>;
  /** True when the corresponding tool_result carried `is_error: true`. */
  hasError: boolean;
  /** The content of the tool_result (may be empty string). */
  resultContent: string;
}

/**
 * A single assistant turn — one reply from Claude — containing zero or more
 * tool invocations.
 */
export interface AssistantTurn {
  /** 1-indexed position of this assistant reply in the full session. */
  index: number;
  /** ISO timestamp of the assistant reply. */
  timestamp: string;
  /** All tool-use events inside this assistant message, in order. */
  toolUses: ToolUseEvent[];
  /** Plain assistant text, used by the conversation-local semantic graph. */
  text?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Locate and read the raw JSONL content for a session ID.
 * Returns `null` when the session file is not found or cannot be read.
 */
function readSessionRaw(sessionId: string): string | null {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return null;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return null;
  }

  for (const dir of projectDirs) {
    const candidate = join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (!existsSync(candidate)) continue;

    let raw: string;
    try {
      raw = readFileSync(candidate, 'utf8');
    } catch {
      return null;
    }

    return raw.trim() ? raw : null;
  }

  return null;
}

/**
 * Parse user messages from raw JSONL text.
 *
 * A "real" user message is a `type: "user"` entry where:
 * - `isMeta` is falsy
 * - At least one `text` block appears in `message.content[]`
 *   (entries containing only `tool_result` blocks are skipped — those are
 *   tool output, not actual user intent).
 *
 * The text from multiple `text` blocks in the same entry is joined with `\n`.
 */
function parseUserMessages(raw: string): UserMessage[] {
  const lines = raw.split('\n');
  const messages: UserMessage[] = [];
  let msgIndex = 0;

  for (const line of lines) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry['type'] !== 'user' || entry['isMeta']) continue;

    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;

    // Collect text blocks; skip if none (tool_result-only entries).
    const textParts: string[] = [];
    for (const block of msg!.content as unknown[]) {
      const b = block as Record<string, unknown>;
      if (b['type'] === 'text' && typeof b['text'] === 'string') {
        textParts.push(b['text']);
      }
    }

    if (textParts.length === 0) continue;

    messages.push({
      index: msgIndex++,
      timestamp: (entry['timestamp'] as string | undefined) ?? '',
      text: textParts.join('\n'),
    });
  }

  return messages;
}

/**
 * Parse the raw JSONL text into structured assistant turns.
 *
 * The JSONL format Claude Code uses:
 * - `type: "assistant"` entries carry `message.content[]` with `tool_use`
 *   blocks. Each tool_use has an `id`, `name`, and `input`.
 * - `type: "user"` entries (non-meta) carry `message.content[]` with
 *   `tool_result` blocks. Each has `tool_use_id`, `is_error`, and `content`.
 *
 * We do a two-pass approach: first collect all tool_use → tool_result pairings
 * by tool_use_id, then build assistant turns.
 */
function parseAssistantTurns(raw: string): AssistantTurn[] {
  const lines = raw.split('\n');

  // Pass 1: index all tool_result entries by tool_use_id.
  const toolResults = new Map<string, { isError: boolean; content: string }>();
  for (const line of lines) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry['type'] !== 'user' || entry['isMeta']) continue;
    const msg = entry['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg!.content as unknown[]) {
      const b = block as Record<string, unknown>;
      if (b['type'] !== 'tool_result') continue;
      const id = b['tool_use_id'] as string | undefined;
      if (!id) continue;
      toolResults.set(id, {
        isError: b['is_error'] === true,
        content: typeof b['content'] === 'string' ? b['content'] : '',
      });
    }
  }

  // Pass 2: build assistant turns.
  const turns: AssistantTurn[] = [];
  let assistantIndex = 0;

  for (const line of lines) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry['type'] !== 'assistant' || entry['isMeta']) continue;

    assistantIndex++;
    const msg = entry['message'] as { content?: unknown } | undefined;
    const timestamp = (entry['timestamp'] as string | undefined) ?? '';

    const toolUses: ToolUseEvent[] = [];
    const textParts: string[] = [];
    if (Array.isArray(msg?.content)) {
      for (const block of msg!.content as unknown[]) {
        const b = block as Record<string, unknown>;
        if (b['type'] === 'text' && typeof b['text'] === 'string') {
          textParts.push(b['text']);
          continue;
        }
        if (b['type'] !== 'tool_use') continue;
        const id = b['id'] as string | undefined;
        const name = b['name'] as string | undefined;
        if (!name) continue;

        const result = id ? toolResults.get(id) : undefined;
        toolUses.push({
          tool: name,
          input: (b['input'] as Record<string, unknown> | undefined) ?? {},
          hasError: result?.isError ?? false,
          resultContent: result?.content ?? '',
        });
      }
    }

    turns.push({ index: assistantIndex, timestamp, toolUses, text: textParts.join('\n') });
  }

  return turns;
}

/**
 * Parse context metrics (peak context token count and inferred context window)
 * from raw JSONL text with a single pass over assistant entries.
 *
 * Mirrors the logic in `conversation-analyzer.ts` for `maxContextTokens` and
 * `contextWindow` but avoids importing that module (which pulls in heavy deps).
 */
function parseContextMetrics(raw: string): ContextMetrics {
  // Context window thresholds — mirrors conversation-analyzer.ts constants.
  const STANDARD_WINDOW = 200_000;
  const EXTENDED_WINDOW = 1_000_000;
  const EXTENDED_WINDOW_TRIGGER = 250_000;

  const lines = raw.split('\n');
  let maxContextTokens = 0;

  for (const line of lines) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry['type'] !== 'assistant' || entry['isMeta']) continue;

    const msg = entry['message'] as {
      usage?: {
        input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_creation?: {
          ephemeral_5m_input_tokens?: number;
          ephemeral_1h_input_tokens?: number;
        };
      };
    } | undefined;
    const usage = msg?.usage;
    if (!usage) continue;

    const input = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cc = usage.cache_creation ?? {};
    let cache5m = cc.ephemeral_5m_input_tokens ?? 0;
    let cache1h = cc.ephemeral_1h_input_tokens ?? 0;
    if (cache5m === 0 && cache1h === 0 && usage.cache_creation_input_tokens) {
      cache5m = usage.cache_creation_input_tokens;
    }
    const cacheCreation = cache5m + cache1h;
    const ctxOnThisTurn = input + cacheRead + cacheCreation;
    if (ctxOnThisTurn > maxContextTokens) maxContextTokens = ctxOnThisTurn;
  }

  const contextWindow =
    maxContextTokens > EXTENDED_WINDOW_TRIGGER ? EXTENDED_WINDOW : STANDARD_WINDOW;

  return { maxContextTokens, contextWindow };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Locate and parse a Claude Code session JSONL by session ID.
 *
 * Scans all project directories under `~/.claude/projects/` to find
 * `<sessionId>.jsonl`. Returns the ordered list of assistant turns with their
 * tool-use events, or `null` if the file is not found or cannot be read.
 *
 * @param sessionId - UUID of the Claude Code session to load.
 */
export function loadSessionTurns(sessionId: string): AssistantTurn[] | null {
  const raw = readSessionRaw(sessionId);
  if (!raw) return null;
  return parseAssistantTurns(raw);
}

/**
 * Locate and parse the real user messages from a Claude Code session JSONL.
 *
 * Only entries that carry at least one `text` block are included — pure
 * `tool_result` entries are skipped. `isMeta` entries (Claude Code internal
 * housekeeping) are also excluded.
 *
 * Scans all project directories under `~/.claude/projects/` to find
 * `<sessionId>.jsonl`. Returns the ordered list of user messages, or `null`
 * if the file is not found or cannot be read.
 *
 * @param sessionId - UUID of the Claude Code session to load.
 */
export function loadUserMessages(sessionId: string): UserMessage[] | null {
  const raw = readSessionRaw(sessionId);
  if (!raw) return null;
  return parseUserMessages(raw);
}

/**
 * Locate and extract context window metrics from a Claude Code session JSONL.
 *
 * Performs a lightweight single-pass scan (no analysis cache needed) to
 * compute the peak context token count and inferred context window size.
 * Returns `null` if the session file cannot be found or read.
 *
 * @param sessionId - UUID of the Claude Code session to load.
 */
export function loadContextMetrics(sessionId: string): ContextMetrics | null {
  const raw = readSessionRaw(sessionId);
  if (!raw) return null;
  return parseContextMetrics(raw);
}
