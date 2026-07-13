import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadCodexDriftSession } from './codex-session-adapter.js';

const fixture = fileURLToPath(new URL('../__fixtures__/codex-session.jsonl', import.meta.url));

describe('loadCodexDriftSession', () => {
  it('adapts native Codex messages, tools, errors, and context for Argos', () => {
    const data = loadCodexDriftSession(fixture, 'codex-test-session', dirname(fixture));
    assert.ok(data);
    assert.deepEqual(data.userMessages.map((message) => message.text), ['Implement the parser']);
    assert.equal(data.assistantTurns.length, 2);
    const toolTurn = data.assistantTurns.find((turn) => turn.toolUses.length > 0);
    assert.deepEqual(toolTurn?.toolUses[0], {
      tool: 'Bash',
      input: { cmd: 'false', command: 'false' },
      hasError: true,
      resultContent: '',
    });
    assert.deepEqual(data.contextMetrics, {
      maxContextTokens: 100,
      contextWindow: 200_000,
    });
  });

  it('rejects a mismatched session id and a transcript outside the allowed root', () => {
    assert.equal(loadCodexDriftSession(fixture, 'another-session', dirname(fixture)), null);
    assert.equal(loadCodexDriftSession(fixture, 'codex-test-session', dirname(dirname(fixture)) + '/missing'), null);
  });
});
