import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import type { ProjectConversation, ConversationMessage } from '@nakiros/shared';

/**
 * List all conversations (JSONL sessions) for a project.
 * Returns metadata without loading full message contents.
 */
export function listConversations(providerProjectDir: string, projectId: string): ProjectConversation[] {
  let files: string[];
  try {
    files = readdirSync(providerProjectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const conversations: ProjectConversation[] = [];

  for (const file of files) {
    const fullPath = join(providerProjectDir, file);
    const sessionId = file.replace('.jsonl', '');

    try {
      const stat = statSync(fullPath);
      const raw = readFileSync(fullPath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);

      if (lines.length === 0) continue;

      let startedAt = '';
      let lastMessageAt = '';
      let gitBranch: string | null = null;
      let cwd = '';
      let claudeVersion: string | null = null;
      let summary = '';
      let messageCount = 0;
      const toolsUsed = new Set<string>();

      for (const line of lines) {
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const timestamp = entry['timestamp'] as string | undefined;

        // Track first and last timestamps
        if (timestamp) {
          if (!startedAt) startedAt = timestamp;
          lastMessageAt = timestamp;
        }

        // Extract metadata from early lines
        if (!cwd && entry['cwd']) cwd = entry['cwd'] as string;
        if (!gitBranch && entry['gitBranch']) gitBranch = entry['gitBranch'] as string;
        if (!claudeVersion && entry['version']) claudeVersion = entry['version'] as string;

        // Count user/assistant messages
        const type = entry['type'] as string;
        if (type === 'user' && !entry['isMeta']) {
          messageCount++;

          // First user message as summary
          if (!summary) {
            const msg = entry['message'] as { content?: unknown } | undefined;
            if (msg?.content) {
              if (typeof msg.content === 'string') {
                summary = msg.content.slice(0, 200);
              } else if (Array.isArray(msg.content)) {
                const textBlock = msg.content.find((c: { type?: string }) => c.type === 'text');
                if (textBlock && 'text' in textBlock) {
                  summary = (textBlock.text as string).slice(0, 200);
                }
              }
            }
            // Skip command messages as summaries
            if (summary.includes('<command-name>') || summary.includes('<command-message>')) {
              summary = '';
            }
          }
        }

        if (type === 'assistant') {
          messageCount++;
          // Track tool usage
          const msg = entry['message'] as { content?: unknown[] } | undefined;
          if (Array.isArray(msg?.content)) {
            for (const block of msg!.content) {
              const b = block as { type?: string; name?: string };
              if (b.type === 'tool_use' && b.name) {
                toolsUsed.add(b.name);
              }
            }
          }
        }
      }

      // Fallback timestamps from file stat
      if (!startedAt) startedAt = stat.birthtime.toISOString();
      if (!lastMessageAt) lastMessageAt = stat.mtime.toISOString();

      conversations.push({
        sessionId,
        projectId,
        startedAt,
        lastMessageAt,
        messageCount,
        toolsUsed: Array.from(toolsUsed),
        gitBranch,
        cwd,
        claudeVersion,
        summary: summary || '(no summary)',
      });
    } catch {
      continue;
    }
  }

  // Sort by most recent first
  conversations.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return conversations;
}

/**
 * Read all messages from a single conversation JSONL file.
 */
export function getConversationMessages(
  providerProjectDir: string,
  sessionId: string,
): ConversationMessage[] {
  const filePath = join(providerProjectDir, `${sessionId}.jsonl`);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter(Boolean);
  const messages: ConversationMessage[] = [];

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry['type'] as string;
    if (type !== 'user' && type !== 'assistant' && type !== 'system') continue;

    // Skip meta messages
    if (entry['isMeta']) continue;

    const uuid = (entry['uuid'] as string) ?? '';
    const parentUuid = (entry['parentUuid'] as string) ?? null;
    const timestamp = (entry['timestamp'] as string) ?? '';
    const isSidechain = (entry['isSidechain'] as boolean) ?? false;

    let content = '';
    const toolUse: { name: string; input: unknown }[] = [];

    const msg = entry['message'] as { content?: unknown } | undefined;
    if (msg?.content) {
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        for (const block of msg.content) {
          const b = block as { type?: string; text?: string; name?: string; input?: unknown };
          if (b.type === 'text' && b.text) {
            textParts.push(b.text);
          } else if (b.type === 'tool_use' && b.name) {
            toolUse.push({ name: b.name, input: b.input ?? {} });
          }
        }
        content = textParts.join('');
      }
    }

    // Skip empty and command messages
    if (!content.trim() && toolUse.length === 0) continue;
    if (content.includes('<command-name>') || content.includes('<local-command-')) continue;

    messages.push({
      uuid,
      parentUuid,
      type: type as ConversationMessage['type'],
      content,
      timestamp,
      isSidechain,
      toolUse: toolUse.length > 0 ? toolUse : undefined,
    });
  }

  return messages;
}
