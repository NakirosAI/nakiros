import type { EnrichedFriction, FrictionCluster } from '@nakiros/shared';

// ---------------------------------------------------------------------------
// Cluster scoring
//
// Formula: score = occurrences × recency_weight × density_weight
//
//   occurrences      — raw count of frictions in the cluster
//   recency_weight   — 1.0 when the most-recent friction is "now", decaying
//                      linearly to 0 at the edge of the active window
//   density_weight   — 1.5 when the cluster is "hot" (≥ HOT_DENSITY_COUNT
//                      frictions in the last HOT_DENSITY_DAYS), else 1.0
//
// Eligibility (for proposal generation) requires at least MIN_OCCURRENCES
// frictions in the cluster. This prevents the engine from generating skills
// from one-off noise.
// ---------------------------------------------------------------------------

export const ACTIVE_WINDOW_DAYS = 14;
/**
 * Minimum cluster size for a proposal to be generated. Default 3 matches the
 * original product spec (dev solo sees stable patterns only). Can be lowered
 * via `NAKIROS_MIN_OCCURRENCES=2` during early onboarding when a user has
 * only a handful of analyzed conversations and wants to sanity-check the
 * end-to-end pipeline before accumulating history.
 */
export const MIN_OCCURRENCES = (() => {
  const raw = process.env.NAKIROS_MIN_OCCURRENCES;
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
})();
export const HOT_DENSITY_DAYS = 7;
export const HOT_DENSITY_COUNT = 3;
export const HOT_DENSITY_BOOST = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function activeWindowCutoff(nowMs: number): number {
  return nowMs - ACTIVE_WINDOW_DAYS * DAY_MS;
}

/**
 * Compute the score for a single cluster. The `frictionsById` map must
 * cover at least every friction referenced by the cluster.
 */
export function scoreCluster(
  cluster: FrictionCluster,
  frictionsById: Map<string, EnrichedFriction>,
  nowMs: number,
): number {
  const occurrences = cluster.frictionIds.length;
  if (occurrences === 0) return 0;

  // Recency: based on the *most recent* friction in the cluster, linearly
  // decaying from 1.0 (just happened) to 0.0 (edge of the active window).
  const ageMs = Math.max(0, nowMs - cluster.lastSeen);
  const windowMs = ACTIVE_WINDOW_DAYS * DAY_MS;
  const recencyWeight = Math.max(0, 1 - ageMs / windowMs);

  // Density: hot cluster if ≥ HOT_DENSITY_COUNT frictions within the last
  // HOT_DENSITY_DAYS. We need the per-friction timestamps to decide.
  const hotCutoff = nowMs - HOT_DENSITY_DAYS * DAY_MS;
  let recentCount = 0;
  for (const id of cluster.frictionIds) {
    const f = frictionsById.get(id);
    if (f && f.timestamp >= hotCutoff) recentCount++;
  }
  const densityWeight = recentCount >= HOT_DENSITY_COUNT ? HOT_DENSITY_BOOST : 1.0;

  return occurrences * recencyWeight * densityWeight;
}

/**
 * Score every cluster in place and return the list sorted by score desc.
 * Clusters below MIN_OCCURRENCES are dropped — they're not eligible for a
 * proposal yet.
 */
export function scoreAndFilter(
  clusters: FrictionCluster[],
  frictions: EnrichedFriction[],
  nowMs: number,
): FrictionCluster[] {
  const byId = new Map<string, EnrichedFriction>();
  for (const f of frictions) byId.set(f.id, f);

  const scored: FrictionCluster[] = [];
  for (const c of clusters) {
    if (c.frictionIds.length < MIN_OCCURRENCES) continue;
    const score = scoreCluster(c, byId, nowMs);
    if (score <= 0) continue;
    scored.push({ ...c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
