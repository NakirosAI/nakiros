import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { readLatestTranscriptVerdict } from './verdict-parser.js';

const root = mkdtempSync(join(tmpdir(), 'nakiros-verdict-'));
after(() => rmSync(root, { recursive: true, force: true }));

describe('readLatestTranscriptVerdict', () => {
  it('reads the newest Claude assistant verdict', () => {
    const dir = join(root, 'claude');
    mkdirSync(dir);
    const file = join(dir, 'session.jsonl');
    writeFileSync(file, [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '<!-- nakiros-drift: on-track -->' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done\n<!-- nakiros-drift: drifting -->' }] } }),
    ].join('\n'));

    assert.equal(readLatestTranscriptVerdict(file, 'claude', dir)?.verdict, 'drifting');
  });

  it('reads a Codex agent verdict and rejects paths outside its root', () => {
    const dir = join(root, 'codex');
    mkdirSync(dir);
    const file = join(dir, 'rollout.jsonl');
    writeFileSync(file, JSON.stringify({
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'Finished\n<!-- nakiros-drift: on-track -->' },
    }));

    assert.equal(readLatestTranscriptVerdict(file, 'codex', dir)?.verdict, 'on-track');
    assert.equal(readLatestTranscriptVerdict(file, 'codex', join(root, 'claude')), null);
  });
});
