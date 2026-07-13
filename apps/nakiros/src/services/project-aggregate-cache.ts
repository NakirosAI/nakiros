import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  ConversationAnalysis,
  Project,
  ProjectAggregate,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { getNakirosDir } from '../utils/nakiros-dir.js';
import { eventBus } from '../daemon/event-bus.js';
import { listConversations } from './conversation-parser.js';
import { getProject } from './project-scanner.js';
import { getOrComputeAnalysis } from './conversation-analysis-cache.js';
import {
  ensureProjectIndexed,
  ensureCoworkProjectIndexed,
  listSessionsForProject,
} from './conversation-ingest/index.js';

function cacheDir(): string {
  const dir = join(getNakirosDir(), 'cache', 'aggregates');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(projectId: string): string {
  return join(cacheDir(), `${projectId}.json`);
}

/**
 * Bumped when the aggregate or underlying ConversationAnalysis token semantics
 * change. Old caches without this version field (or with a smaller one) are
 * invalidated by `loadProjectAggregate` so the frontend falls back to refresh.
 *
 * v1 (2026-04-30) — totalTokens now excludes cache_read (matches Claude Code).
 */
const AGGREGATE_VERSION = 1;

/** In-memory dedupe so concurrent refreshes share a single recompute pass. */
const inFlight = new Map<string, Promise<ProjectAggregate | null>>();

/**
 * Synchronous read of the persisted aggregate for `projectId`. Returns `null`
 * when no cache exists yet — first ever home boot, freshly-rescanned project,
 * or after a manual cache wipe.
 */
export function loadProjectAggregate(projectId: string): ProjectAggregate | null {
  const file = cachePath(projectId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProjectAggregate;
    // Stale schema → force refresh on the frontend side.
    if ((parsed.version ?? 0) < AGGREGATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Batch cache lookup. Never indexes conversations or recomputes aggregates. */
export function loadProjectAggregates(
  projectIds: string[],
  loader: (projectId: string) => ProjectAggregate | null = loadProjectAggregate,
): ProjectAggregate[] {
  const aggregates: ProjectAggregate[] = [];
  for (const projectId of new Set(projectIds)) {
    const aggregate = loader(projectId);
    if (aggregate) aggregates.push(aggregate);
  }
  return aggregates;
}

/**
 * Whether a cached aggregate needs an explicit refresh. Aggregate computation
 * is currently Claude/Cowork-native; Codex-only projects are never marked
 * stale and must use their native Argos analysis path instead.
 */
export function isProjectAggregateStale(
  project: Pick<Project, 'provider' | 'lastActivityAt'>,
  aggregate: ProjectAggregate | null,
): boolean {
  if (project.provider !== 'claude' && project.provider !== 'cowork') return false;
  if (!aggregate) return true;
  if (!project.lastActivityAt) return false;
  const computedAt = new Date(aggregate.computedAt).getTime();
  const lastActivityAt = new Date(project.lastActivityAt).getTime();
  if (!Number.isFinite(computedAt) || !Number.isFinite(lastActivityAt)) return true;
  return computedAt < lastActivityAt;
}

/**
 * Recompute the aggregate for `projectId` by walking every conversation
 * through the per-conversation analysis cache, persist the result, and
 * broadcast `project:aggregateUpdated`. Concurrent calls for the same
 * project share a single recompute via {@link inFlight}.
 */
export function refreshProjectAggregate(projectId: string): Promise<ProjectAggregate | null> {
  const existing = inFlight.get(projectId);
  if (existing) return existing;
  const task = computeAggregate(projectId).finally(() => inFlight.delete(projectId));
  inFlight.set(projectId, task);
  return task;
}

async function computeAggregate(projectId: string): Promise<ProjectAggregate | null> {
  const project = getProject(projectId);
  if (!project) return null;

  // Conversation ingestion is still Claude/Cowork-specific. Codex projects
  // must not be parsed through the Claude JSONL pipeline while their native
  // Argos adapter is being introduced.
  if (project.provider !== 'claude' && project.provider !== 'cowork') return null;

  // Trigger lazy ingest so the aggregate is always based on up-to-date data,
  // even when the HomeScreen card is opened before the user navigates into the
  // project (which is the only place ensureIndexed was previously called).
  if (project.provider === 'cowork') {
    ensureCoworkProjectIndexed(project.providerProjectDir, project.projectPath);
  } else {
    ensureProjectIndexed(project.providerProjectDir);
  }

  const analyses: ConversationAnalysis[] = [];

  // Prefer the ingest store: for Cowork projects, the JSONL files do NOT live
  // directly under providerProjectDir, so listConversations() would return 0
  // results and the aggregate would be empty.  Use the per-session
  // transcriptPath (via dirname) to locate the correct JSONL folder.
  const sessions = listSessionsForProject(project.projectPath);
  if (sessions.length > 0) {
    for (const s of sessions) {
      const analysisDir = dirname(s.transcriptPath);
      const a = getOrComputeAnalysis(analysisDir, s.sessionId, projectId);
      if (a) analyses.push(a);
    }
  } else {
    // Fallback for projects not yet indexed (fresh daemon boot, manual wipe,
    // or pre-ingest non-cowork projects).
    const convs = listConversations(project.providerProjectDir, projectId);
    for (const conv of convs) {
      const a = getOrComputeAnalysis(
        project.providerProjectDir,
        conv.sessionId,
        projectId,
      );
      if (a) analyses.push(a);
    }
  }

  const aggregate = aggregateAnalyses(projectId, analyses);

  try {
    writeFileSync(cachePath(projectId), JSON.stringify(aggregate));
  } catch {
    // Best-effort persistence — never block the caller.
  }

  eventBus.broadcast(IPC_CHANNELS['project:aggregateUpdated'], aggregate);
  return aggregate;
}

function aggregateAnalyses(
  projectId: string,
  analyses: ConversationAnalysis[],
): ProjectAggregate {
  if (analyses.length === 0) {
    return {
      projectId,
      score: null,
      healthy: 0,
      watch: 0,
      critical: 0,
      totalConvs: 0,
      totalTokens: 0,
      computedAt: new Date().toISOString(),
      version: AGGREGATE_VERSION,
    };
  }

  let healthy = 0;
  let watch = 0;
  let critical = 0;
  let scoreSum = 0;
  let tokenSum = 0;
  for (const a of analyses) {
    if (a.healthZone === 'healthy') healthy++;
    else if (a.healthZone === 'watch') watch++;
    else if (a.healthZone === 'degraded') critical++;
    scoreSum += a.score;
    tokenSum += a.totalTokens;
  }

  return {
    projectId,
    score: Math.round(scoreSum / analyses.length),
    healthy,
    watch,
    critical,
    totalConvs: analyses.length,
    totalTokens: tokenSum,
    computedAt: new Date().toISOString(),
    version: AGGREGATE_VERSION,
  };
}
