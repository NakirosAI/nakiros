import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isProjectActivityInactive,
  isProjectVisible,
  projectStatusFromActivity,
} from './project-activity.js';

const NOW = Date.parse('2026-07-13T12:00:00.000Z');

test('marks session-backed projects inactive after 30 days', () => {
  assert.equal(isProjectActivityInactive('2026-06-14T12:00:00.000Z', NOW), false);
  assert.equal(isProjectActivityInactive('2026-06-12T11:59:59.000Z', NOW), true);
  assert.equal(projectStatusFromActivity('2026-06-12T11:59:59.000Z', NOW), 'inactive');
});

test('keeps configuration-only projects without activity visible', () => {
  assert.equal(isProjectActivityInactive(null, NOW), false);
  assert.equal(isProjectVisible({ status: 'active', lastActivityAt: null }, NOW), true);
});

test('hides dismissed, explicitly inactive, and stale active records', () => {
  assert.equal(
    isProjectVisible({ status: 'dismissed', lastActivityAt: '2026-07-13T11:00:00.000Z' }, NOW),
    false,
  );
  assert.equal(
    isProjectVisible({ status: 'inactive', lastActivityAt: '2026-07-13T11:00:00.000Z' }, NOW),
    false,
  );
  assert.equal(
    isProjectVisible({ status: 'active', lastActivityAt: '2026-06-01T12:00:00.000Z' }, NOW),
    false,
  );
});
