import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { ConversationAnalysis } from '@nakiros/shared';

import { getNakirosDir } from '../utils/nakiros-dir.js';
import { analyzeConversation } from './conversation-analyzer.js';

interface CacheEntry {
  /** Cache schema version — bump when the analysis shape or scoring changes. */
  version: number;
  source: {
    /** Source JSONL `mtime` in epoch ms — used to detect changes. */
    mtimeMs: number;
    /** Source JSONL byte size — secondary safeguard against silent rewrites. */
    size: number;
  };
  analysis: ConversationAnalysis;
}

/**
 * Bumped when `ConversationAnalysis` shape or `analyzeConversation` scoring
 * changes. Existing cache files with a mismatched version are ignored and
 * recomputed.
 *
 * v2 (2026-04-30) — added `costSamples`, `pausePoints`, `cacheMode`,
 * `cacheTtlMin`. Auto-detection of cache 1h beta also fixes wastedCacheTokens.
 *
 * v3 (2026-04-30) — `totalTokens` now excludes cache_read (matches Claude
 * Code's "consumed" counter). Old caches inflated this by 50× on heavy-cache
 * sessions.
 *
 * v4 (2026-05-12) — `frictionPoints` now derived from sentiment trace
 * (Negative && score > 0.85) instead of lexical regex patterns.
 * `matchedPattern` field is now `'sentiment:<score>'` (e.g. `'sentiment:0.92'`).
 *
 * v5 (2026-05-12) — A/B test; intermediate version for distilbert baseline.
 *
 * v6 (2026-05-12) — switched sentiment model to bert-multilingual-uncased-sentiment
 * (nlptown 5-class star rating). Labels now from summed probabilities
 * (Neg=P(1*)+P(2*), Neu=P(3*), Pos=P(4*)+P(5*)). Friction threshold lowered
 * to 0.60 to match the new score scale.
 *
 * v7 (2026-05-12) — added three new signals to `frictionPoints` and `tips`:
 * Signal B (backtrack): Edit/Write/MultiEdit that reverts earlier agent output,
 * detected by exact normalized-string match between current new_string and a
 * prior old_string on the same file. matchedPattern: 'backtrack:<file>:T<N>->T<M>'.
 * Signal C (repetition): user message with Jaccard > 0.5 vs any of the 5
 * previous user messages (3+-char tokens). matchedPattern: 'repetition:T<N>:<j>'.
 * Signal E (long-gap topic change): ConversationTip emitted when 30min+ gap
 * between user messages combines with Jaccard < 0.2 — suggests new topic,
 * benefit from a fresh conversation. id='long-gap-topic-change'.
 *
 * v8 (2026-05-12) — added `frictionZones: ConversationFrictionZone[]`. Each
 * zone spans from the first preceding assistant turn (after the previous user
 * message) up to the user-reaction turn, and carries an `agentContext`
 * summarising files touched, tool calls, errors, backtracks, and keyActions.
 * Backtrack-only frictionPoints without a downstream user reaction within 5
 * user turns produce `severity: 'low'` zones. `frictionPoints[]` is unchanged
 * for backward compatibility.
 *
 * v9 (2026-05-12) — multi-signal convergence for `frictionZones`. A zone is
 * now emitted only when at least 2 distinct signals (S1 sentiment, S2
 * repetition, S4 backtrack, S5 tool-error-spike, S6 repeated-edit-failure)
 * fire within a 5-turn window. Single-signal events no longer create zones.
 * New signals: S5 (≥ 2 tool errors in 5 turns) and S6 (≥ 2 "string not
 * found" errors on same file). Severity: 2 signals → medium, 3+ → high;
 * `low` is no longer emitted. New field `signalKinds` on each zone exposes
 * which signals fired. `frictionPoints[]` is unchanged.
 *
 * v10 (2026-05-12) — complete redesign of `frictionZones` to a stuck-cluster
 * model. A zone now requires the user to be stuck on a topic: 3+ user messages
 * with Jaccard > 0.3 within a 10-turn user-message window, after the first 10
 * user messages (setup phase skip). Sentiment/backtrack/tool-errors become
 * enrichments (signalKinds) that bump severity; they no longer create zones.
 * S2 (repetition) removed from signalKinds union — superseded by the cluster
 * algorithm. New field `clusterSize: number` on each zone. Severity: 3 msgs
 * = medium, 5+ = high; bumped one level if any enrichment signal present.
 * `frictionPoints[]` is unchanged (backward compat for badges + score).
 * `matchedPattern` on zone's reactionPoint: `'stuck-cluster:<size>:<jaccardAvg>'`.
 *
 * v11 (2026-05-12) — removed S1 (sentiment) enrichment signal from
 * `signalKinds` union. The bert-nlptown model produced too many false positives
 * on French dev/agent dialog. `signalKinds` now only covers `'S4' | 'S5' | 'S6'`.
 * `frictionPoints[]` no longer includes sentiment-derived entries.
 */
const CACHE_VERSION = 11;

function cacheDir(): string {
  const dir = join(getNakirosDir(), 'cache', 'analyses');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(sessionId: string): string {
  return join(cacheDir(), `${sessionId}.json`);
}

function sourcePath(providerProjectDir: string, sessionId: string): string {
  return join(providerProjectDir, `${sessionId}.jsonl`);
}

/**
 * Read the cached analysis for `sessionId` if its source JSONL is unchanged
 * (mtime + size match). Returns `null` on any miss — does NOT recompute.
 *
 * Pure lookup: callers wanting a guaranteed result should fall through to
 * {@link getOrComputeAnalysis}.
 */
export function peekCachedAnalysis(
  providerProjectDir: string,
  sessionId: string,
): ConversationAnalysis | null {
  const file = cachePath(sessionId);
  if (!existsSync(file)) return null;

  let entry: CacheEntry;
  try {
    entry = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry;
  } catch {
    return null;
  }
  if (entry.version !== CACHE_VERSION) return null;

  const src = sourcePath(providerProjectDir, sessionId);
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(src);
  } catch {
    return null;
  }

  if (stat.mtimeMs !== entry.source.mtimeMs || stat.size !== entry.source.size) {
    return null;
  }
  return entry.analysis;
}

/**
 * Cached wrapper around {@link analyzeConversation}. Returns the cached
 * analysis when the source JSONL is unchanged, otherwise recomputes and
 * persists the new entry.
 */
export function getOrComputeAnalysis(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): ConversationAnalysis | null {
  const cached = peekCachedAnalysis(providerProjectDir, sessionId);
  if (cached) return cached;

  const fresh = analyzeConversation(providerProjectDir, sessionId, projectId);
  if (!fresh) return null;

  const src = sourcePath(providerProjectDir, sessionId);
  let mtimeMs = 0;
  let size = 0;
  try {
    const stat = statSync(src);
    mtimeMs = stat.mtimeMs;
    size = stat.size;
  } catch {
    // No source stat = nothing to cache; return the fresh analysis but skip persistence.
    return fresh;
  }

  const entry: CacheEntry = {
    version: CACHE_VERSION,
    source: { mtimeMs, size },
    analysis: fresh,
  };
  try {
    writeFileSync(cachePath(sessionId), JSON.stringify(entry));
  } catch {
    // Persistence is best-effort — never block the caller on cache write failure.
  }
  return fresh;
}
