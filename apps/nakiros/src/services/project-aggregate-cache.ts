import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  ConversationAnalysis,
  ProjectAggregate,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { getNakirosDir } from '../utils/nakiros-dir.js';
import { eventBus } from '../daemon/event-bus.js';
import { listConversations } from './conversation-parser.js';
import { getProject } from './project-scanner.js';
import { getOrComputeAnalysis } from './conversation-analysis-cache.js';

function cacheDir(): string {
  const dir = join(getNakirosDir(), 'cache', 'aggregates');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(projectId: string): string {
  return join(cacheDir(), `${projectId}.json`);
}

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
    return JSON.parse(readFileSync(file, 'utf8')) as ProjectAggregate;
  } catch {
    return null;
  }
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

  const convs = listConversations(project.providerProjectDir, projectId);
  const analyses: ConversationAnalysis[] = [];
  for (const conv of convs) {
    const a = getOrComputeAnalysis(
      project.providerProjectDir,
      conv.sessionId,
      projectId,
    );
    if (a) analyses.push(a);
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
  };
}
