import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AssistantTurn, UserMessage } from './session-loader.js';
import { computeTopicMetrics, detectTopic } from './topic-detector.js';

function messages(texts: string[]): UserMessage[] {
  return texts.map((text, index) => ({ index, timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`, text }));
}

const AUTH = 'application authentication session token security login user permissions';
const SQL = 'postgres database migration schema table index transaction query storage';
const CSS = 'tailwind stylesheet responsive layout animation typography colors frontend';
const AUTH_DE = 'Anwendung Authentifizierung Sitzung Token Sicherheit Anmeldung Berechtigungen';
const SQL_DE = 'Postgres Datenbank Migration Schema Tabelle Index Transaktion Abfrage Speicher';
const AUTH_ZH = '应用身份验证会话令牌安全登录用户权限';
const SQL_ZH = '数据库迁移架构表索引事务查询存储';

describe('goal-anchored topic drift', () => {
  it('does not fire for a cohesive deep-dive', () => {
    const result = detectTopic(messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      'authentication middleware validates session token permissions for every request',
      'session security rotates token cookies after successful login refresh',
      'user permissions remain attached to the authenticated application session',
      'authentication tests cover expired session token and invalid login cookie',
    ]));
    assert.equal(result, null);
  });

  it('requires a sustained departure rather than one unrelated request', () => {
    const result = detectTopic(messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      'authentication session token validation now passes every security test',
      'user login permissions remain consistent across the application middleware',
      CSS,
    ]));
    assert.equal(result, null);
  });

  it('opens adjudication after three consecutive off-goal messages', () => {
    const result = detectTopic(messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      SQL,
      `${SQL} foreign constraints`,
      `${SQL} rollback strategy`,
    ]));
    assert.equal(result?.type, 'topic');
    assert.equal(result?.evidence['sustainedDepartureCount'], 3);
    assert.equal(result?.evidence['transitionsDetected'], 1);
  });

  it('keeps planned subtopics connected through the early conversation graph', () => {
    const input = messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      SQL,
      `${SQL} foreign constraints`,
      `${SQL} rollback strategy`,
    ]);
    const plan: AssistantTurn[] = [{
      index: 1,
      timestamp: '2026-01-01T00:00:01Z',
      toolUses: [],
      text: [
        'Implementation plan for application authentication:',
        `1. ${AUTH}`,
        `2. ${SQL}`,
        `3. ${CSS}`,
      ].join('\n'),
    }];

    assert.equal(detectTopic(input)?.type, 'topic');
    assert.equal(detectTopic(input, plan), null);
    const metrics = computeTopicMetrics(input, plan);
    assert.equal(metrics?.similarityMethod, 'conversation-graph');
    assert.ok((metrics?.semanticAnchorTokens ?? 0) > 0);
  });

  it('leaves an intentional reframe for agent adjudication', () => {
    const input = messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      `Maintenant je veux travailler sur la migration PostgreSQL du schéma database`,
      `${SQL} foreign constraints`,
      `${SQL} rollback strategy`,
      `${SQL} migration runner`,
      `${SQL} production backup`,
      `${SQL} integration tests`,
    ]);
    assert.equal(detectTopic(input)?.type, 'topic');
    assert.equal(computeTopicMetrics(input)?.goalBoundaryIndex, 0);
  });

  it('ignores short non-substantive turns without matching their language', () => {
    const input = messages([
      AUTH,
      'ok on continue',
      `${AUTH} refresh middleware`,
      'weiter',
      `${AUTH} cookie rotation`,
      '继续',
      'authentication middleware validates session token permissions for every request',
      'session security rotates token cookies after successful login refresh',
      'user permissions remain attached to the authenticated application session',
    ]);
    assert.equal(detectTopic(input), null);
  });

  it('detects sustained departure in German without language keywords', () => {
    assert.equal(detectTopic(messages([
      AUTH_DE,
      `${AUTH_DE} Erneuerung Middleware`,
      `${AUTH_DE} Cookie Rotation`,
      SQL_DE,
      `${SQL_DE} Fremdschlüssel Einschränkungen`,
      `${SQL_DE} Rollback Strategie`,
    ]))?.type, 'topic');
  });

  it('detects sustained departure in Chinese without language keywords', () => {
    assert.equal(detectTopic(messages([
      AUTH_ZH,
      `${AUTH_ZH}刷新中间件`,
      `${AUTH_ZH}轮换Cookie`,
      SQL_ZH,
      `${SQL_ZH}外键约束`,
      `${SQL_ZH}回滚策略`,
    ]))?.type, 'topic');
  });

  it('resets the goal boundary after /clear', () => {
    const input = messages([
      AUTH,
      CSS,
      '/clear',
      SQL,
      `${SQL} foreign constraints`,
      `${SQL} rollback strategy`,
      `${SQL} migration runner`,
      `${SQL} production backup`,
      `${SQL} integration tests`,
    ]);
    assert.equal(detectTopic(input), null);
    assert.equal(computeTopicMetrics(input)?.goalBoundaryIndex, 3);
  });
});
