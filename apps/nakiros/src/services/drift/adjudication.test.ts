import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import type { DriftReport } from '../drift-analyzer.js';
import {
  requestTopicDriftAdjudication,
  resolveTopicDriftAdjudication,
} from './adjudication.js';

const root = mkdtempSync(join(tmpdir(), 'nakiros-adjudication-flow-'));
after(() => rmSync(root, { recursive: true, force: true }));

const report: DriftReport = {
  type: 'topic',
  severity: 'medium',
  message: 'Possible departure',
  suggestion: 'Review the objective',
  evidence: { transitionsDetected: 2, userMessageCount: 8 },
};

function assistant(text: string) {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
  });
}

describe('topic drift adjudication flow', () => {
  it('injects one review request and suppresses an on-track decision', () => {
    const transcriptPath = join(root, 'on-track.jsonl');
    const storePath = join(root, 'on-track-store.json');
    writeFileSync(transcriptPath, assistant('Previous answer'));
    const request = {
      provider: 'claude' as const,
      sessionId: 'on-track-session',
      transcriptPath,
      transcriptRootOverride: root,
      storePath,
    };

    const prompt = requestTopicDriftAdjudication(request, report);
    assert.match(prompt?.additionalContext ?? '', /nakiros-drift: on-track/);
    assert.equal(requestTopicDriftAdjudication(request, report), null);
    appendFileSync(transcriptPath, `\n${assistant('Done\n<!-- nakiros-drift: on-track -->')}`);
    assert.equal(resolveTopicDriftAdjudication(request), null);
    assert.equal(requestTopicDriftAdjudication(request, report), null);
  });

  it('surfaces the stored report only after a drifting verdict', () => {
    const transcriptPath = join(root, 'drifting.jsonl');
    const storePath = join(root, 'drifting-store.json');
    writeFileSync(transcriptPath, assistant('Previous answer'));
    const request = {
      provider: 'claude' as const,
      sessionId: 'drifting-session',
      transcriptPath,
      transcriptRootOverride: root,
      storePath,
    };

    assert.ok(requestTopicDriftAdjudication(request, report));
    appendFileSync(transcriptPath, `\n${assistant('Done\n<!-- nakiros-drift: drifting -->')}`);
    assert.deepEqual(resolveTopicDriftAdjudication(request), report);
    assert.equal(resolveTopicDriftAdjudication(request), null);
  });
});
