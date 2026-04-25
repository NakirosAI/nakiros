import { createHash } from 'crypto';

import type { EnrichedFriction, FrictionCluster } from '@nakiros/shared';

// ---------------------------------------------------------------------------
// Clustering — groups semantically-similar frictions using sentence
// embeddings from `Xenova/all-MiniLM-L6-v2` (384 dims). The model itself is
// lazy-downloaded (~22 MB) on first use from the HuggingFace cache.
//
// The `@huggingface/transformers` import is dynamic + defensive: if the
// package fails to resolve (platform issue with onnxruntime, offline at
// first run, etc.) the engine degrades to "no clustering" rather than
// crashing the daemon. Callers check `embed()` for a non-null result.
// ---------------------------------------------------------------------------

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
// Cosine threshold above which two frictions are considered to describe the
// same pain point.
//
// Tuning notes (MiniLM-L6-v2 on 20-60 word friction descriptions):
//   0.85+  — near-duplicates only (same sentence rephrased)
//   0.70   — still very tight; misses same-pain-different-wording pairs
//   0.60   — groups same pain pattern across projects (e.g. "UI doesn't
//            update after wiring change" across different components)
//   0.50   — begins to merge weakly related pain points, too loose
// Empirically 0.60 is the sweet spot for the friction shape our deep
// analyzer produces. Bumping requires rechecking the false-merge rate.
const CLUSTER_THRESHOLD = 0.6;

type Extractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: true },
) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<Extractor | null> | null = null;

/**
 * Lazy-load the embedding pipeline once per process. Returns null when the
 * package or model cannot be loaded — callers must handle that gracefully.
 */
async function getExtractor(): Promise<Extractor | null> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    try {
      // Dynamic import so a platform-level resolution failure (e.g.
      // onnxruntime binary mismatch) doesn't kill the daemon at boot.
      const mod = (await import('@huggingface/transformers')) as {
        pipeline: (task: string, model: string) => Promise<Extractor>;
      };
      return await mod.pipeline('feature-extraction', MODEL_ID);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[proposal-engine] Embedding pipeline unavailable — clustering disabled for this session.',
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  })();
  return extractorPromise;
}

/**
 * Embed a single piece of text. Returns a unit-normalized vector (so cosine
 * similarity reduces to a dot product), or null when the model isn't
 * available.
 */
export async function embed(text: string): Promise<number[] | null> {
  const extractor = await getExtractor();
  if (!extractor) return null;
  try {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[proposal-engine] embed() failed — skipping this friction.',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Cosine similarity between two vectors. Assumes both are unit-normalized
 * (which `embed()` guarantees). No defensive normalization here — the extra
 * math is pure overhead when the precondition holds.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Mean centroid of a set of already-unit-normalized vectors. Not re-normalized
 * — the centroid is used for cluster-vs-cluster similarity comparisons and a
 * slight magnitude drift is acceptable at that scale.
 */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Greedy single-pass clustering. Each friction is compared to the running
 * centroid of every existing cluster; it joins the best one above threshold,
 * or opens a new cluster. Fast (O(n × k) with k small in practice) and good
 * enough for the scale we care about (hundreds of frictions in a 14-day
 * window).
 *
 * Frictions without an embedding (legacy or model-less session) are skipped
 * — they'll cluster next time the model is available.
 *
 * The cluster `id` is a stable content-hash of the cluster's centroid so
 * that a rejected cluster can be matched against future recomputations of
 * "the same pain point" (see proposal-engine orchestrator).
 */
export function clusterFrictions(frictions: EnrichedFriction[]): FrictionCluster[] {
  const clusters: {
    frictionIds: string[];
    vectors: number[][];
    centroid: number[];
    firstSeen: number;
    lastSeen: number;
    skillCounts: Map<string, number>;
  }[] = [];

  for (const friction of frictions) {
    if (!friction.embedding || friction.embedding.length === 0) continue;

    let bestIdx = -1;
    let bestScore = CLUSTER_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      const score = cosineSim(friction.embedding, clusters[i].centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      clusters.push({
        frictionIds: [friction.id],
        vectors: [friction.embedding],
        centroid: friction.embedding.slice(),
        firstSeen: friction.timestamp,
        lastSeen: friction.timestamp,
        skillCounts: skillCountsFor(friction),
      });
      continue;
    }

    const c = clusters[bestIdx];
    c.frictionIds.push(friction.id);
    c.vectors.push(friction.embedding);
    c.centroid = centroid(c.vectors);
    c.firstSeen = Math.min(c.firstSeen, friction.timestamp);
    c.lastSeen = Math.max(c.lastSeen, friction.timestamp);
    for (const skill of friction.skillsDetected) {
      c.skillCounts.set(skill, (c.skillCounts.get(skill) ?? 0) + 1);
    }
  }

  return clusters.map((c) => ({
    id: clusterIdFromCentroid(c.centroid),
    frictionIds: c.frictionIds,
    score: 0, // filled in by scoring.ts
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    dominantSkill: pickDominantSkill(c.skillCounts, c.frictionIds.length),
  }));
}

function skillCountsFor(friction: EnrichedFriction): Map<string, number> {
  const out = new Map<string, number>();
  for (const skill of friction.skillsDetected) {
    out.set(skill, (out.get(skill) ?? 0) + 1);
  }
  return out;
}

/** A skill counts as "dominant" only if it appears in > 50% of the cluster's frictions. */
function pickDominantSkill(
  counts: Map<string, number>,
  totalFrictions: number,
): string | undefined {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }
  if (!best) return undefined;
  return best.count / totalFrictions > 0.5 ? best.name : undefined;
}

/**
 * Stable id for a cluster — a content hash of the rounded centroid. Two
 * clusters whose pain points look nearly identical produce the same id,
 * which is what the rejection-matching logic relies on.
 */
function clusterIdFromCentroid(vec: number[]): string {
  // Quantize to 2 decimals so minor drift between runs keeps the same id.
  const quantized = vec.map((v) => Math.round(v * 100) / 100).join(',');
  return createHash('sha1').update(quantized).digest('hex').slice(0, 16);
}
