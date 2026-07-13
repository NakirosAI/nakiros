import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UserMessage } from './session-loader.js';
import { detectContext } from './context-detector.js';

function messages(texts: string[]): UserMessage[] {
  return texts.map((text, index) => ({ index, timestamp: '', text }));
}

const AUTH = 'application authentication session token security login user permissions';
const SQL = 'postgres database migration schema table index transaction query storage';
const pressure = { maxContextTokens: 140_000, contextWindow: 200_000 };

describe('goal-aware context drift', () => {
  it('ignores one isolated off-goal message even under context pressure', () => {
    const input = messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      `${AUTH} validation tests`,
      `${AUTH} expired credentials`,
      `${AUTH} request guards`,
      `${AUTH} permission scopes`,
      `${AUTH} logout cleanup`,
      `${AUTH} integration coverage`,
      SQL,
    ]);
    assert.equal(detectContext(pressure, input), null);
  });

  it('fires after two consecutive departures when context is already heavy', () => {
    const input = messages([
      AUTH,
      `${AUTH} refresh middleware`,
      `${AUTH} cookie rotation`,
      `${AUTH} validation tests`,
      `${AUTH} expired credentials`,
      `${AUTH} request guards`,
      `${AUTH} permission scopes`,
      `${AUTH} logout cleanup`,
      SQL,
      `${SQL} rollback strategy`,
    ]);
    const result = detectContext(pressure, input);
    assert.equal(result?.type, 'context');
    assert.equal(result?.evidence['sustainedDepartureCount'], 2);
  });
});
