import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface HistoryMessage {
  role: 'user' | 'agent';
  content: string;
  tools: Array<{ name: string; display: string }>;
}

/**
 * Encode a filesystem path into the format Claude uses for project directories.
 * e.g. /Users/foo/bar → -Users-foo-bar
 */
function encodeProjectPath(repoPath: string): string {
  return repoPath.replace(/\//g, '-');
}

/**
 * Read and reconstruct conversation messages from Claude's JSONL file.
 * Claude stores conversations at ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
 */
export function readClaudeHistory(sessionId: string, repoPath: string): HistoryMessage[] {
  const projectDir = encodeProjectPath(repoPath);
  const jsonlPath = join(homedir(), '.claude', 'projects', projectDir, `${sessionId}.jsonl`);

  if (!existsSync(jsonlPath)) return [];

  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter(Boolean);

  // We process in order. Assistant chunks share the same message.id — we merge them
  // by keeping a live reference in the messages array.
  const messages: HistoryMessage[] = [];
  const agentByMsgId = new Map<string, HistoryMessage>();

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    // ── Skip queue-operation bookkeeping ──────────────────────────────────────
    if (entry['type'] === 'queue-operation') continue;

    // ── User messages ─────────────────────────────────────────────────────────
    if (entry['type'] === 'user') {
      // Skip meta messages (command expansion injected by Claude Code)
      if (entry['isMeta']) continue;

      const msg = entry['message'] as { role?: string; content?: unknown } | undefined;
      const content = msg?.content;

      let text = '';
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        // Skip tool_result messages (responses to tool calls)
        if (content.some((c: { type?: string }) => c.type === 'tool_result')) continue;
        text = content
          .filter((c: { type?: string }) => c.type === 'text')
          .map((c: { type?: string; text?: string }) => c.text ?? '')
          .join('');
      }

      text = text.trim();
      if (!text) continue;
      // Skip command-injected content
      if (text.includes('<command-message>') || text.includes('<command-name>')) continue;

      messages.push({ role: 'user', content: text, tools: [] });
    }

    // ── Assistant messages ────────────────────────────────────────────────────
    if (entry['type'] === 'assistant') {
      const msg = entry['message'] as { id?: string; content?: unknown[] } | undefined;
      const msgId = msg?.id;
      if (!msgId) continue;

      const content = msg?.content;
      if (!Array.isArray(content)) continue;

      // Get or create the agent message for this message.id
      let agentMsg = agentByMsgId.get(msgId);
      if (!agentMsg) {
        agentMsg = { role: 'agent', content: '', tools: [] };
        agentByMsgId.set(msgId, agentMsg);
        messages.push(agentMsg); // push reference — mutations below are reflected here
      }

      for (const block of content) {
        const b = block as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
        if (b.type === 'text' && b.text) {
          agentMsg.content += b.text;
        } else if (b.type === 'tool_use' && b.name) {
          // Avoid duplicate tool entries (same block can appear in multiple streaming chunks)
          const alreadyListed = agentMsg.tools.some((t) => t.name === b.name && t.display === b.name);
          if (!alreadyListed) {
            agentMsg.tools.push({ name: b.name, display: b.name });
          }
        }
        // 'thinking' blocks are skipped intentionally
      }
    }
  }

  // Filter out empty agent messages (e.g. pure tool-call turns with no text)
  return messages.filter((m) => m.content.trim() || m.tools.length > 0);
}
