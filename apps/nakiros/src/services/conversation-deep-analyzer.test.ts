import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodexConversationAnalysis, ConversationAnalysis } from '@nakiros/shared';

import { analysisFilePath, buildAnalyzeConvoPrompt } from './conversation-deep-analyzer.js';

const common = {
  sessionId: 'session', projectId: 'project', startedAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-01T00:01:00Z', durationMs: 60_000, messageCount: 2,
  summary: 'Implement parser', gitBranch: null, score: 90, healthZone: 'healthy' as const,
  compactions: [], maxContextTokens: 10, contextWindow: 100, totalTokens: 20,
  contextSamples: [], frictionPoints: [], toolStats: {}, toolErrorCount: 0,
};
const messages = [{
  uuid: 'message', parentUuid: null, type: 'user' as const, content: 'Implement parser',
  timestamp: common.startedAt, isSidechain: false,
}];

describe('provider-neutral deep analysis', () => {
  it('labels a Codex source and only serializes capabilities it exposes', () => {
    const analysis = {
      ...common, provider: 'codex', model: 'gpt', frictionPoints: [],
      turnDurationsMs: [], abortedTurns: 0, scoreFactors: [],
    } as unknown as CodexConversationAnalysis;
    const prompt = buildAnalyzeConvoPrompt(analysis, messages);
    assert.match(prompt, /Codex|codex/);
    assert.doesNotMatch(prompt, /following Claude Code conversation/);
    assert.match(prompt, /missing provider capabilities as unavailable/);
    assert.match(prompt, /<analysis-protocol>/);
    assert.match(prompt, /Friction & frustration/);
  });

  it('keeps source and analyzer providers isolated in cache paths', () => {
    assert.notEqual(analysisFilePath('same', 'claude'), analysisFilePath('same', 'codex'));
    assert.notEqual(
      analysisFilePath('same', 'codex', 'claude'),
      analysisFilePath('same', 'codex', 'codex'),
    );
  });

  it('still accepts the native Claude analysis contract', () => {
    const analysis = {
      ...common, cacheReadTokens: 0, cacheCreationTokens: 0, cacheMissTurns: 0,
      wastedCacheTokens: 0, frictionZones: [], hotFiles: [], sidechainCount: 0,
      slashCommands: [], diagnostic: 'healthy', tips: [], drift: null,
    } as unknown as ConversationAnalysis;
    assert.match(buildAnalyzeConvoPrompt(analysis, messages), /claude coding-agent conversation/);
  });
});
