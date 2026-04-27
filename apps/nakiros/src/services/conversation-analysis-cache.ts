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
 */
const CACHE_VERSION = 1;

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
