import type { ConversationAnalysis } from '@nakiros/shared';

/**
 * Number of points each sparkline carries. Independent of the user-picked
 * window (10/30/90/all): we always render `BUCKET_COUNT` evenly-sized
 * buckets so the visual length is comparable across windows.
 */
const BUCKET_COUNT = 10;

/** Time-series companion data for the new-design overview KPIs. */
export interface OverviewSeries {
  /** Number of conversations per bucket. */
  count: number[];
  /** Average score [0..100] per bucket. Empty buckets fall back to 0. */
  score: number[];
  /** Compaction rate as a percentage [0..100] per bucket. */
  compactionRate: number[];
  /** Sum of `frictionPoints.length` per bucket. */
  frictions: number[];
  /** Sum of `wastedCacheTokens` per bucket. */
  cacheWasted: number[];
}

/**
 * Bucketize a chronologically-ordered slice of conversation analyses into
 * `BUCKET_COUNT` evenly-sized buckets, computing per-bucket aggregates for
 * each KPI surfaced in the overview KPIs.
 *
 * The caller passes `windowed` already filtered to the active window
 * (sorted desc by `lastMessageAt`). We reverse it so the resulting series
 * read **left-to-right = oldest-to-newest**, matching the sparkline reading
 * direction.
 *
 * Empty windows yield empty arrays (the `Sparkline` component renders
 * nothing in that case). When a bucket falls empty (window smaller than
 * `BUCKET_COUNT`), its slot collapses out entirely rather than being
 * filled with 0 — that keeps the sparkline visually honest.
 */
export function bucketizeForOverview(windowed: ConversationAnalysis[]): OverviewSeries {
  if (windowed.length === 0) {
    return { count: [], score: [], compactionRate: [], frictions: [], cacheWasted: [] };
  }

  // Caller hands us most-recent-first; sparklines read oldest → newest.
  const chronological = [...windowed].reverse();

  const bucketSize = Math.ceil(chronological.length / BUCKET_COUNT);
  const buckets: ConversationAnalysis[][] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const start = i * bucketSize;
    if (start >= chronological.length) break;
    const end = Math.min(start + bucketSize, chronological.length);
    buckets.push(chronological.slice(start, end));
  }

  return {
    count: buckets.map((b) => b.length),
    score: buckets.map((b) =>
      b.length === 0 ? 0 : Math.round(b.reduce((s, c) => s + c.score, 0) / b.length),
    ),
    compactionRate: buckets.map((b) => {
      if (b.length === 0) return 0;
      const compacted = b.filter((c) => c.compactions.length > 0).length;
      return Math.round((compacted / b.length) * 100);
    }),
    frictions: buckets.map((b) =>
      b.reduce((s, c) => s + c.frictionPoints.length, 0),
    ),
    cacheWasted: buckets.map((b) =>
      b.reduce((s, c) => s + c.wastedCacheTokens, 0),
    ),
  };
}
