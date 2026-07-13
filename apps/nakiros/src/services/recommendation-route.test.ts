import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RecoCard, RecommendationArtifactType } from '@nakiros/shared';

import { recommendationReviewRoute } from './recommendation-route.js';

function card(artifactType: RecommendationArtifactType): RecoCard {
  return {
    recId: 'r', patternId: 'p', action: 'fix', artifactType, target: 'target',
    title: 'title', body: 'body', brief: 'brief', evidence: { zoneRefs: [], files: [] },
    status: 'pending', createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('recommendation review routing', () => {
  it('routes skills to Techne', () => {
    assert.deepEqual(recommendationReviewRoute(card('skill')), {
      sourceDomain: 'argos', targetDomain: 'techne', artifactType: 'skill',
      action: 'fix', target: 'target', reviewRequired: true,
    });
  });

  it('routes agent configuration artifacts to Hestia', () => {
    const artifacts: RecommendationArtifactType[] = [
      'rules', 'claudemd', 'subagent', 'hook', 'permission', 'mcp', 'output-style',
    ];
    for (const artifact of artifacts) {
      assert.equal(recommendationReviewRoute(card(artifact))?.targetDomain, 'hestia');
    }
  });
});
