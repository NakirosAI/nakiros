import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodexConversationAnalysis, ConversationAnalysis } from '@nakiros/shared';

import { buildArgosAgentComparison } from './argos-agent-comparison.js';

function claude(id: string, day: number): ConversationAnalysis {
  return {
    sessionId: id,
    projectId: 'p',
    startedAt: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    lastMessageAt: `2026-07-${String(day).padStart(2, '0')}T10:10:00.000Z`,
    durationMs: 600_000,
    messageCount: 10,
    totalTokens: 1_000,
    score: 80,
    healthZone: 'healthy',
    frictionPoints: [],
    compactions: [],
    toolStats: { Read: { count: 10, errorCount: 1 } },
    toolErrorCount: 1,
  } as unknown as ConversationAnalysis;
}

function codex(id: string, day: number, totalTokens: number | null): CodexConversationAnalysis {
  return {
    provider: 'codex',
    sessionId: id,
    projectId: 'p',
    startedAt: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    lastMessageAt: `2026-07-${String(day).padStart(2, '0')}T10:08:00.000Z`,
    durationMs: 480_000,
    messageCount: 8,
    totalTokens,
    score: 90,
    healthZone: 'healthy',
    frictionPoints: [],
    compactions: [],
    toolStats: { exec_command: { count: 8, errorCount: 0 } },
    toolErrorCount: 0,
    model: 'gpt-5-codex',
  } as unknown as CodexConversationAnalysis;
}

describe('Argos agent comparison', () => {
  it('returns directional evidence without ranking providers', () => {
    const result = buildArgosAgentComparison('p', [
      claude('c1', 10), claude('c2', 11), claude('c3', 12),
      codex('x1', 10, 900), codex('x2', 11, 950), codex('x3', 12, 1_000),
    ], '2026-07-13T00:00:00.000Z');

    assert.equal(result.confidence, 'directional');
    assert.deepEqual(result.reasons, ['tasks-not-paired']);
    assert.equal(result.providers.length, 2);
    assert.equal(result.evidence.tasksPaired, false);
    assert.equal('winner' in result, false);
  });

  it('exposes partial native metric coverage', () => {
    const result = buildArgosAgentComparison('p', [codex('x1', 10, null), codex('x2', 11, 900)]);
    const tokens = result.providers[0]?.metrics.find((entry) => entry.id === 'tokens-per-conversation');
    assert.equal(tokens?.observedSamples, 1);
    assert.equal(tokens?.coverage, 0.5);
    assert.equal(result.confidence, 'insufficient');
    assert.ok(result.reasons.includes('single-provider'));
  });

  it('excludes synthetic Claude runs from evidence', () => {
    const synthetic = { ...claude('synthetic', 10), kind: 'synthetic' as const };
    const result = buildArgosAgentComparison('p', [synthetic, claude('user', 10)]);
    assert.equal(result.providers[0]?.sampleSize, 1);
  });
});
