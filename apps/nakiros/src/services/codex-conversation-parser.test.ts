import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseCodexConversationFile } from './codex-conversation-parser.js';
import { isCodexSubagentThreadSource } from './providers/codex-session.js';

const fixture = fileURLToPath(
  new URL('./__fixtures__/codex-session.jsonl', import.meta.url),
);
const subagentFixture = fileURLToPath(
  new URL('./__fixtures__/codex-subagent-session.jsonl', import.meta.url),
);

describe('parseCodexConversationFile', () => {
  it('extracts native messages and metrics without double-counting mirrors', () => {
    const parsed = parseCodexConversationFile(fixture, 'project-id');
    assert.ok(parsed);
    assert.equal(parsed.conversation.provider, 'codex');
    assert.equal(parsed.conversation.sessionId, 'codex-test-session');
    assert.equal(parsed.conversation.model, 'gpt-test');
    assert.equal(parsed.conversation.contextWindow, 200_000);
    assert.equal(parsed.conversation.durationMs, 10_000);
    assert.equal(parsed.conversation.toolErrorCount, 1);
    assert.deepEqual(parsed.conversation.toolsUsed, ['exec_command']);
    assert.deepEqual(parsed.conversation.tokenUsage, {
      inputTokens: 100,
      cachedInputTokens: 25,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      totalTokens: 120,
      contextWindow: 200_000,
    });
    assert.equal(parsed.conversation.messageCount, 2);
    assert.equal(parsed.messages.filter((message) => message.content).length, 2);
    assert.equal(parsed.messages.filter((message) => message.toolUse).length, 1);
    assert.equal(parsed.messages.some((message) => message.content.includes('duplicate')), false);
  });

  it('excludes a rollout whose first session metadata identifies a subagent', () => {
    assert.equal(parseCodexConversationFile(subagentFixture, 'project-id'), null);
    assert.equal(isCodexSubagentThreadSource('subagent'), true);
    assert.equal(isCodexSubagentThreadSource({ type: 'subagent' }), true);
    assert.equal(isCodexSubagentThreadSource('user'), false);
  });
});
