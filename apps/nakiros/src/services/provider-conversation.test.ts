import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodexConversationAnalysis, ConversationAnalysis } from '@nakiros/shared';

import { normalizeProviderConversation } from './provider-conversation.js';

const common = {
  sessionId: 's', projectId: 'p', startedAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-01T00:01:00Z', durationMs: 60_000, messageCount: 1,
  summary: 'summary', gitBranch: null, frictionPoints: [], score: 100,
  healthZone: 'healthy' as const,
};

describe('provider-neutral conversation contract', () => {
  it('normalizes Claude without inspecting its native JSONL shape', () => {
    const analysis = { ...common } as unknown as ConversationAnalysis;
    const normalized = normalizeProviderConversation(analysis, [{
      uuid: 'm', parentUuid: null, type: 'user', content: 'hello', timestamp: common.startedAt,
      isSidechain: false,
    }]);
    assert.equal(normalized.provider, 'claude');
    assert.equal(normalized.messages[0]?.provider, 'claude');
  });

  it('normalizes Codex with the same contract', () => {
    const analysis = { ...common, provider: 'codex' } as unknown as CodexConversationAnalysis;
    const normalized = normalizeProviderConversation(analysis, [{
      uuid: 'm', parentUuid: null, type: 'user', content: '你好世界', timestamp: common.startedAt,
      isSidechain: false, provider: 'codex',
    }]);
    assert.equal(normalized.provider, 'codex');
    assert.equal(normalized.frictionPoints.length, 0);
  });
});
