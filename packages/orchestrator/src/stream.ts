import type { StreamEvent } from './types.js';

// ─── Tool display formatting ──────────────────────────────────────────────────

export function formatTool(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => str.length > max ? str.slice(0, max) + '…' : str;

  switch (name) {
    case 'Read':       return `Reading ${s(input['file_path'])}`;
    case 'Write':      return `Writing ${s(input['file_path'])}`;
    case 'Edit':
    case 'MultiEdit':  return `Editing ${s(input['file_path'])}`;
    case 'Bash':       return `$ ${truncate(s(input['command']))}`;
    case 'Glob':       return `Glob: ${s(input['pattern'])}`;
    case 'Grep':       return `Grep: ${s(input['pattern'])} in ${s(input['path'] ?? '.')}`;
    case 'TodoWrite':  return 'Updating tasks';
    case 'WebFetch':   return `Fetch: ${truncate(s(input['url']), 60)}`;
    case 'WebSearch':  return `Search: ${s(input['query'])}`;
    case 'Task':       return `Sub-agent: ${truncate(s(input['description']), 60)}`;
    default:           return name;
  }
}

// ─── Claude / Cursor stream format ───────────────────────────────────────────

interface ClaudeSystemEvent {
  type: 'system';
  subtype: 'init';
  session_id: string;
  cwd?: string;
  tools?: string[];
  model?: string;
}

interface ClaudeContentText { type: 'text'; text: string }
interface ClaudeContentTool { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ClaudeContent = ClaudeContentText | ClaudeContentTool;

interface ClaudeAssistantEvent {
  type: 'assistant';
  message: { content: ClaudeContent[] };
  session_id?: string;
}

interface ClaudeResultEvent {
  type: 'result';
  subtype: 'success' | 'error_during_execution';
  result?: string;
  session_id?: string;
  is_error?: boolean;
}

type ClaudeStreamEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeResultEvent
  | { type: string };

export function handleClaudeLikeEvent(
  event: ClaudeStreamEvent,
  onEvent: (e: StreamEvent) => void,
  state: { hasEmittedText: boolean },
): void {
  switch (event.type) {
    case 'system': {
      const sys = event as ClaudeSystemEvent;
      if (sys.session_id) onEvent({ type: 'session', id: sys.session_id });
      return;
    }
    case 'assistant': {
      const ast = event as ClaudeAssistantEvent;
      if (ast.session_id) onEvent({ type: 'session', id: ast.session_id });
      for (const block of ast.message.content ?? []) {
        if (block.type === 'text' && block.text) {
          state.hasEmittedText = true;
          onEvent({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          onEvent({ type: 'tool', name: block.name, display: formatTool(block.name, block.input ?? {}) });
        }
      }
      return;
    }
    case 'result': {
      const res = event as ClaudeResultEvent;
      if (res.session_id) onEvent({ type: 'session', id: res.session_id });
      if (!state.hasEmittedText && res.result) onEvent({ type: 'text', text: res.result });
      return;
    }
    default:
      return;
  }
}

// ─── Codex stream format ──────────────────────────────────────────────────────

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
}

interface CodexStreamEvent {
  type?: string;
  thread_id?: string;
  item?: CodexItem;
}

export function handleCodexEvent(
  event: CodexStreamEvent,
  onEvent: (e: StreamEvent) => void,
  state: { hasEmittedText: boolean },
): void {
  if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
    onEvent({ type: 'session', id: event.thread_id });
    return;
  }

  if (!event.item) return;

  if (event.type === 'item.started' && event.item.type === 'command_execution' && event.item.command) {
    onEvent({ type: 'tool', name: 'Bash', display: `$ ${event.item.command}` });
    return;
  }

  if (event.type === 'item.completed') {
    if (event.item.type === 'agent_message' && event.item.text) {
      state.hasEmittedText = true;
      onEvent({ type: 'text', text: event.item.text });
      return;
    }
    if (event.item.type === 'command_execution' && event.item.command) {
      onEvent({ type: 'tool', name: 'Bash', display: `$ ${event.item.command}` });
    }
  }
}
