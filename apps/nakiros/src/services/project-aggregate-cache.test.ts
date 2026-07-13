import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectAggregate } from '@nakiros/shared';

import {
  isProjectAggregateStale,
  loadProjectAggregates,
} from './project-aggregate-cache.js';

function aggregate(projectId: string, computedAt: string): ProjectAggregate {
  return {
    projectId,
    score: 90,
    healthy: 1,
    watch: 0,
    critical: 0,
    totalConvs: 1,
    totalTokens: 100,
    computedAt,
    version: 1,
  };
}

describe('project aggregate batch cache', () => {
  it('deduplicates ids and performs cache-only lookups', () => {
    const calls: string[] = [];
    const result = loadProjectAggregates(['a', 'a', 'missing', 'b'], (projectId) => {
      calls.push(projectId);
      return projectId === 'missing' ? null : aggregate(projectId, '2026-07-13T10:00:00Z');
    });
    assert.deepEqual(calls, ['a', 'missing', 'b']);
    assert.deepEqual(result.map((item) => item.projectId), ['a', 'b']);
  });

  it('marks only Claude/Cowork caches older than project activity as stale', () => {
    const fresh = aggregate('p', '2026-07-13T10:00:00Z');
    assert.equal(
      isProjectAggregateStale(
        { provider: 'claude', lastActivityAt: '2026-07-13T11:00:00Z' },
        fresh,
      ),
      true,
    );
    assert.equal(
      isProjectAggregateStale(
        { provider: 'cowork', lastActivityAt: '2026-07-13T09:00:00Z' },
        fresh,
      ),
      false,
    );
    assert.equal(
      isProjectAggregateStale(
        { provider: 'codex', lastActivityAt: '2026-07-13T11:00:00Z' },
        null,
      ),
      false,
    );
    assert.equal(
      isProjectAggregateStale(
        { provider: 'claude', lastActivityAt: '2026-07-13T11:00:00Z' },
        null,
      ),
      true,
    );
  });
});
