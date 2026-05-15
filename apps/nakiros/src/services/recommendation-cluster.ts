/**
 * Friction-pattern clustering — daemon-side, pure functions, no LLM.
 *
 * Aggregates {@link ConversationFrictionZone} records from every conversation
 * of a project and groups similar zones into {@link RecommendationPattern}s
 * via Jaccard similarity on reaction tokens + file/signal affinity bonuses.
 *
 * See `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
 */
import { createHash } from 'crypto';
import { basename } from 'path';

import type {
  ConversationFrictionZone,
  RecommendationPattern,
  RecommendationZoneRef,
} from '@nakiros/shared';

import { jaccard, tokenizeForCluster } from './runner-core/cluster-tokens.js';

/** Internal record carrying both the zone and its ref for the clustering pass. */
export interface ZoneWithRef {
  ref: RecommendationZoneRef;
  zone: ConversationFrictionZone;
  tokens: Set<string>;
  fileBasenames: Set<string>;
  signalKinds: Set<string>;
}

const SCORE_THRESHOLD = 0.30;
const FILE_BONUS = 0.10;
const SIGNAL_BONUS = 0.05;
const MAX_PATTERNS = 20;
const SEVERITY_BUMP_AT = 4;

/**
 * Build the per-zone token set used by the clustering pass. Combines the
 * reaction message text (first 200 chars), the `keyActions` join, and the
 * basenames of files touched.
 */
export function extractZoneTokens(zone: ConversationFrictionZone): Set<string> {
  const out = new Set<string>();
  const reactionText = zone.reactionPoint?.snippet ?? '';
  for (const t of tokenizeForCluster(reactionText.slice(0, 200))) out.add(t);
  const actions = (zone.agentContext?.keyActions ?? []).join(' ');
  for (const t of tokenizeForCluster(actions)) out.add(t);
  for (const f of zone.agentContext?.filesTouched ?? []) {
    out.add(basename(f).toLowerCase());
  }
  return out;
}

/**
 * Similarity score between two zones. Jaccard on tokens, +0.10 if any
 * filesTouched basename overlaps, +0.05 if any signalKind overlaps.
 */
export function scoreZones(a: ZoneWithRef, b: ZoneWithRef): number {
  let s = jaccard(a.tokens, b.tokens);
  for (const f of a.fileBasenames) {
    if (b.fileBasenames.has(f)) { s += FILE_BONUS; break; }
  }
  for (const k of a.signalKinds) {
    if (b.signalKinds.has(k)) { s += SIGNAL_BONUS; break; }
  }
  return s;
}

/**
 * Group zones into patterns via Union-Find on the score graph.
 * Returns one pattern per connected component with `zoneCount >= 2`,
 * sorted by severity desc then zoneCount desc, capped to {@link MAX_PATTERNS}.
 */
export function groupPatterns(projectId: string, items: ZoneWithRef[]): RecommendationPattern[] {
  // Defensive: drop zones with empty tokens (cannot be clustered).
  const candidates = items.filter((z) => z.tokens.size > 0);

  // Defensive: drop zones whose reactionPoint text is a synthetic interrupt
  // (the analyzer already filters these in v11+; this is belt-and-braces for
  // older cached entries).
  const filtered = candidates.filter(
    (z) => !/Request interrupted by user/i.test(z.zone.reactionPoint?.snippet ?? ''),
  );

  // Union-Find.
  const parent: number[] = filtered.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number): void => {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      if (scoreZones(filtered[i], filtered[j]) > SCORE_THRESHOLD) {
        union(i, j);
      }
    }
  }

  // Build clusters keyed by root.
  const clusters = new Map<number, ZoneWithRef[]>();
  for (let i = 0; i < filtered.length; i++) {
    const r = find(i);
    let list = clusters.get(r);
    if (!list) { list = []; clusters.set(r, list); }
    list.push(filtered[i]);
  }

  // Build patterns.
  const patterns: RecommendationPattern[] = [];
  for (const list of clusters.values()) {
    if (list.length < 2) continue;
    patterns.push(buildPattern(projectId, list));
  }

  // Sort and cap.
  patterns.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
    return b.zoneCount - a.zoneCount;
  });
  return patterns.slice(0, MAX_PATTERNS);
}

/**
 * Build a {@link RecommendationPattern} from a cluster of zones. Stable id
 * = sha1 of sorted `"convoId:zoneId"` strings.
 */
function buildPattern(projectId: string, list: ZoneWithRef[]): RecommendationPattern {
  const zoneRefs = list
    .map((z) => z.ref)
    .sort((a, b) => `${a.convoId}:${a.zoneId}`.localeCompare(`${b.convoId}:${b.zoneId}`));
  const id = createHash('sha1')
    .update(zoneRefs.map((r) => `${r.convoId}:${r.zoneId}`).join('|'))
    .digest('hex')
    .slice(0, 16);

  // Token frequency for topTokens.
  const tokenFreq = new Map<string, number>();
  for (const z of list) {
    for (const t of z.tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }
  const topTokens = [...tokenFreq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([t]) => t);

  // Files (deduped, first-seen order).
  const filesSeen = new Set<string>();
  const filesTouched: string[] = [];
  for (const z of list) {
    for (const f of z.zone.agentContext?.filesTouched ?? []) {
      if (!filesSeen.has(f)) { filesSeen.add(f); filesTouched.push(f); }
    }
  }

  // Signal kinds union.
  const signals = new Set<'S4' | 'S5' | 'S6'>();
  for (const z of list) for (const k of z.zone.signalKinds ?? []) signals.add(k);

  // Timestamps.
  const startTs = list.map((z) => z.zone.startTimestamp).sort();
  const endTs = list.map((z) => z.zone.endTimestamp).sort();
  const firstSeen = startTs[0];
  const lastSeen = endTs[endTs.length - 1];

  // Severity: max across zones, bumped to high when zoneCount >= 4.
  const hasHigh = list.some((z) => z.zone.severity === 'high');
  const baseSeverity: 'medium' | 'high' = hasHigh ? 'high' : 'medium';
  const severity: 'medium' | 'high' =
    list.length >= SEVERITY_BUMP_AT ? 'high' : baseSeverity;

  return {
    id,
    projectId,
    zoneRefs,
    signature: {
      topTokens,
      filesTouched,
      signalKinds: [...signals],
      firstSeen,
      lastSeen,
    },
    zoneCount: list.length,
    severity,
    analysis: { status: 'idle' },
  };
}

/** Wraps a zone into the internal {@link ZoneWithRef} carrier. */
export function wrapZone(ref: RecommendationZoneRef, zone: ConversationFrictionZone): ZoneWithRef {
  return {
    ref,
    zone,
    tokens: extractZoneTokens(zone),
    fileBasenames: new Set((zone.agentContext?.filesTouched ?? []).map((f) => basename(f).toLowerCase())),
    signalKinds: new Set(zone.signalKinds ?? []),
  };
}
