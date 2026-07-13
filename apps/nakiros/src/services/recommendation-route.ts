import type {
  GetRecommendationReviewRouteResponse,
  RecoCard,
  RecommendationArtifactType,
  RecommendationReviewRoute,
  RecommendationTargetDomain,
} from '@nakiros/shared';

const DOMAIN_BY_ARTIFACT: Record<RecommendationArtifactType, RecommendationTargetDomain> = {
  skill: 'techne',
  rules: 'hestia',
  claudemd: 'hestia',
  subagent: 'hestia',
  hook: 'hestia',
  permission: 'hestia',
  mcp: 'hestia',
  'output-style': 'hestia',
};

/** Build the public review route without invoking a consumer or mutating state. */
export function recommendationReviewRoute(card: RecoCard): RecommendationReviewRoute | null {
  const targetDomain = DOMAIN_BY_ARTIFACT[card.artifactType];
  if (!targetDomain) return null;
  return {
    sourceDomain: 'argos',
    targetDomain,
    artifactType: card.artifactType,
    action: card.action,
    target: card.target,
    reviewRequired: true,
  };
}

export function decorateRecommendationRoute(card: RecoCard): RecoCard {
  const route = recommendationReviewRoute(card);
  return route ? { ...card, route } : card;
}

export function reviewRouteResponse(card: RecoCard | null): GetRecommendationReviewRouteResponse {
  if (!card) return { ok: false, error: 'reco-not-found' };
  const route = recommendationReviewRoute(card);
  return route
    ? { ok: true, route }
    : { ok: false, error: 'unknown-artifact-type' };
}
