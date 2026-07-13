import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzeParsedCodexConversation } from './codex-conversation-analyzer.js';
import { parseCodexConversationFile } from './codex-conversation-parser.js';

function fixture(name: string) {
  return fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
}

describe('analyzeParsedCodexConversation', () => {
  it('keeps a low-signal native session healthy with an explainable tool penalty', () => {
    const parsed = parseCodexConversationFile(fixture('codex-session.jsonl'), 'project-id');
    assert.ok(parsed);
    const userMessage = parsed.messages.find((message) => message.type === 'user');
    assert.ok(userMessage);
    userMessage.content = 'Do not stop until the parser is complete';
    const analysis = analyzeParsedCodexConversation(parsed);
    assert.equal(analysis.provider, 'codex');
    assert.equal(analysis.healthZone, 'healthy');
    assert.equal(analysis.score, 92);
    assert.equal(analysis.frictionPoints.length, 0);
    assert.deepEqual(analysis.scoreFactors, [
      { signal: 'tool-errors', count: 1, penalty: 8 },
    ]);
  });

  it('degrades on native context pressure, compaction, tool error and abort without reading user vocabulary', () => {
    const parsed = parseCodexConversationFile(
      fixture('codex-degraded-session.jsonl'),
      'project-id',
    );
    assert.ok(parsed);
    const analysis = analyzeParsedCodexConversation(parsed);
    assert.equal(analysis.healthZone, 'degraded');
    assert.equal(analysis.score, 42);
    assert.equal(analysis.maxContextTokens, 90);
    assert.equal(analysis.compactions.length, 1);
    assert.equal(analysis.toolStats['exec_command']?.errorCount, 1);
    assert.equal(analysis.abortedTurns, 1);
    assert.equal(analysis.frictionPoints.length, 1);
    assert.equal(analysis.frictionPoints[0]?.matchedPattern, 'abort');
    assert.deepEqual(
      analysis.scoreFactors.map((factor) => factor.signal),
      ['context', 'compaction', 'tool-errors', 'aborts'],
    );
  });

  it('detects a repeated request structurally in Chinese', () => {
    const parsed = parseCodexConversationFile(fixture('codex-session.jsonl'), 'project-id');
    assert.ok(parsed);
    parsed.messages.push(
      {
        uuid: 'repeat-1', parentUuid: null, type: 'user', timestamp: '2026-07-12T10:01:00.000Z',
        content: '请修复数据库迁移架构表索引事务查询错误', isSidechain: false, provider: 'codex',
      },
      {
        uuid: 'repeat-2', parentUuid: null, type: 'user', timestamp: '2026-07-12T10:02:00.000Z',
        content: '请修复数据库迁移架构表索引事务查询错误', isSidechain: false, provider: 'codex',
      },
    );
    const analysis = analyzeParsedCodexConversation(parsed);
    assert.equal(analysis.frictionPoints.length, 1);
    assert.match(analysis.frictionPoints[0]?.matchedPattern ?? '', /^repetition:/);
    assert.equal(analysis.scoreFactors.at(-1)?.signal, 'friction');
  });
});
