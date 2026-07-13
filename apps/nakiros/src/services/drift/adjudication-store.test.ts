import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import type { DriftReport } from '../drift-analyzer.js';
import {
  beginDriftAdjudication,
  getDriftAdjudication,
  resolveDriftAdjudication,
} from './adjudication-store.js';

const root = mkdtempSync(join(tmpdir(), 'nakiros-adjudication-'));
const store = join(root, 'adjudications.json');
after(() => rmSync(root, { recursive: true, force: true }));

const report: DriftReport = {
  type: 'topic',
  severity: 'medium',
  message: 'Possible topic drift',
  suggestion: 'Confirm the objective',
  evidence: {
    userMessageCount: 8,
    transitionsDetected: 2,
    sustainedDepartureCount: 3,
    consideredAfterClearIdx: null,
  },
};

describe('drift adjudication persistence', () => {
  it('opens once, ignores an old verdict, and persists a fresh decision', () => {
    const baseline = { verdict: 'on-track' as const, marker: 'old' };
    assert.ok(beginDriftAdjudication('codex', 'session-1', report, baseline, store));
    assert.equal(beginDriftAdjudication('codex', 'session-1', report, baseline, store), null);
    assert.equal(resolveDriftAdjudication('codex', 'session-1', baseline, store), null);

    const resolved = resolveDriftAdjudication(
      'codex',
      'session-1',
      { verdict: 'on-track', marker: 'fresh' },
      store,
    );
    assert.equal(resolved?.verdict, 'on-track');
    assert.equal(getDriftAdjudication('codex', 'session-1', store)?.status, 'on-track');
    assert.equal(beginDriftAdjudication('codex', 'session-1', report, null, store), null);
  });

  it('reopens review when the topic signal materially changes', () => {
    const changed: DriftReport = {
      ...report,
      evidence: { ...report.evidence, transitionsDetected: 3, userMessageCount: 9 },
    };
    assert.ok(beginDriftAdjudication('codex', 'session-1', changed, null, store));
    const resolved = resolveDriftAdjudication(
      'codex',
      'session-1',
      { verdict: 'drifting', marker: 'second-verdict' },
      store,
    );
    assert.equal(resolved?.verdict, 'drifting');
    assert.equal(resolved?.report.evidence['transitionsDetected'], 3);
  });

  it('reopens after a prior on-track verdict when departure keeps growing', () => {
    const session = 'strong-signal-session';
    assert.ok(beginDriftAdjudication('claude', session, report, null, store));
    assert.equal(
      resolveDriftAdjudication(
        'claude',
        session,
        { verdict: 'on-track', marker: 'strong-first' },
        store,
      )?.verdict,
      'on-track',
    );
    const stronger: DriftReport = {
      ...report,
      evidence: {
        ...report.evidence,
        userMessageCount: 10,
        sustainedDepartureCount: 5,
      },
    };
    assert.ok(beginDriftAdjudication('claude', session, stronger, null, store));
  });
});
