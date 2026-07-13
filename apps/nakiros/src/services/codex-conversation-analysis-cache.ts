import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import type { CodexConversationAnalysis } from '@nakiros/shared';

import { getNakirosDir } from '../utils/nakiros-dir.js';
import { analyzeParsedCodexConversation } from './codex-conversation-analyzer.js';
import {
  parseCodexConversationFile,
  type ParsedCodexSession,
} from './codex-conversation-parser.js';

// v2 removes language-specific correction matching and stores structural
// friction points (repetition + native aborts).
const CACHE_VERSION = 2;

interface SourceRecord {
  mtimeMs: number;
  size: number;
  sessionId: string | null;
  projectPath: string | null;
  cacheKey: string | null;
}

interface Manifest {
  version: number;
  sources: Record<string, SourceRecord>;
}

interface AnalysisEntry {
  version: number;
  source: { path: string; mtimeMs: number; size: number };
  analysis: CodexConversationAnalysis;
}

export interface CodexAnalysisCacheOptions {
  /** Test seam; production uses ~/.nakiros/cache/codex-analyses. */
  cacheRoot?: string;
  /** Test seam for verifying invalidation/recomputation. */
  parseFile?: typeof parseCodexConversationFile;
  /** Test seam simulating a future scoring/schema version. */
  cacheVersion?: number;
}

interface SourceStat {
  path: string;
  mtimeMs: number;
  size: number;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function samePath(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function cacheRoot(options: CodexAnalysisCacheOptions): string {
  const root = options.cacheRoot ?? join(getNakirosDir(), 'cache', 'codex-analyses');
  mkdirSync(join(root, 'entries'), { recursive: true });
  return root;
}

function manifestPath(root: string, sessionsDir: string): string {
  return join(root, `manifest-${hash(canonicalPath(sessionsDir))}.json`);
}

function entryPath(root: string, cacheKey: string): string {
  return join(root, 'entries', `${cacheKey}.json`);
}

function walkJsonl(dir: string): SourceStat[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sources: SourceStat[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sources.push(...walkJsonl(path));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try {
        const stat = statSync(path);
        sources.push({ path, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // File disappeared during the walk.
      }
    }
  }
  return sources;
}

function readManifest(path: string, version: number): Manifest {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Manifest>;
    if (parsed.version === version && parsed.sources && typeof parsed.sources === 'object') {
      return parsed as Manifest;
    }
  } catch {
    // Missing or corrupt cache is a normal cold start.
  }
  return { version, sources: {} };
}

function readEntry(
  root: string,
  record: SourceRecord,
  sourcePath: string,
  version: number,
  projectId: string,
): CodexConversationAnalysis | null {
  if (!record.cacheKey) return null;
  try {
    const entry = JSON.parse(readFileSync(entryPath(root, record.cacheKey), 'utf8')) as AnalysisEntry;
    if (
      entry.version !== version ||
      entry.source.path !== sourcePath ||
      entry.source.mtimeMs !== record.mtimeMs ||
      entry.source.size !== record.size ||
      entry.analysis.provider !== 'codex'
    ) {
      return null;
    }
    return { ...entry.analysis, projectId };
  } catch {
    return null;
  }
}

function persistEntry(
  root: string,
  source: SourceStat,
  cacheKey: string,
  analysis: CodexConversationAnalysis,
  version: number,
): void {
  const entry: AnalysisEntry = {
    version,
    source: { path: source.path, mtimeMs: source.mtimeMs, size: source.size },
    analysis,
  };
  try {
    writeFileSync(entryPath(root, cacheKey), JSON.stringify(entry));
  } catch {
    // Cache writes are best effort.
  }
}

/**
 * List native Codex analyses with persistent source-aware caching. Warm hits
 * walk/stat the rollout tree but never read complete JSONL files.
 */
export function listCachedCodexAnalyses(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
  options: CodexAnalysisCacheOptions = {},
): CodexConversationAnalysis[] {
  const root = cacheRoot(options);
  const version = options.cacheVersion ?? CACHE_VERSION;
  const path = manifestPath(root, sessionsDir);
  const previous = readManifest(path, version);
  const currentSources = walkJsonl(sessionsDir);
  const seen = new Set(currentSources.map((source) => source.path));
  const next: Manifest = { version, sources: {} };
  const analyses: CodexConversationAnalysis[] = [];
  const parseFile = options.parseFile ?? parseCodexConversationFile;

  for (const source of currentSources) {
    const prior = previous.sources[source.path];
    const unchanged = prior?.mtimeMs === source.mtimeMs && prior.size === source.size;
    let record = unchanged ? prior : undefined;

    // Unchanged irrelevant/subagent/other-project sources are remembered and
    // skipped without opening their JSONL again.
    if (record && record.sessionId === null) {
      next.sources[source.path] = record;
      continue;
    }
    if (record?.projectPath && !samePath(record.projectPath, projectPath)) {
      next.sources[source.path] = record;
      continue;
    }

    let analysis = record ? readEntry(root, record, source.path, version, projectId) : null;

    if (!analysis) {
      const parsed: ParsedCodexSession | null = parseFile(source.path, projectId);
      if (!parsed) {
        record = { ...source, sessionId: null, projectPath: null, cacheKey: null };
      } else {
        const fresh = analyzeParsedCodexConversation(parsed);
        const cacheKey = hash(source.path);
        record = {
          ...source,
          sessionId: fresh.sessionId,
          projectPath: parsed.conversation.cwd,
          cacheKey,
        };
        persistEntry(root, source, cacheKey, fresh, version);
        analysis = { ...fresh, projectId };
      }
    }

    if (!record) continue;
    next.sources[source.path] = record;
    if (analysis && record.projectPath && samePath(record.projectPath, projectPath)) {
      analyses.push(analysis);
    }
  }

  for (const [sourcePath, stale] of Object.entries(previous.sources)) {
    if (seen.has(sourcePath) || !stale.cacheKey) continue;
    try {
      unlinkSync(entryPath(root, stale.cacheKey));
    } catch {
      // Already absent or cache directory is read-only.
    }
  }
  try {
    writeFileSync(path, JSON.stringify(next));
  } catch {
    // Best effort: the computed analyses remain usable for this request.
  }

  return analyses.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function getCachedCodexAnalysis(
  sessionsDir: string,
  projectPath: string,
  projectId: string,
  sessionId: string,
  options: CodexAnalysisCacheOptions = {},
): CodexConversationAnalysis | null {
  return (
    listCachedCodexAnalyses(sessionsDir, projectPath, projectId, options).find(
      (analysis) => analysis.sessionId === sessionId,
    ) ?? null
  );
}
