import type { Project, ProjectAggregate } from '@nakiros/shared';

const MAX_CONCURRENT_REFRESHES = 2;
const pendingIds: string[] = [];
const queuedIds = new Set<string>();
const activeIds = new Set<string>();
let activeCount = 0;
const aggregateBatchRequests = new Map<string, Promise<ProjectAggregate[]>>();

/** Share an in-flight batch across StrictMode effect replays. */
export function listProjectAggregatesOnce(projectIds: string[]): Promise<ProjectAggregate[]> {
  const normalizedIds = [...new Set(projectIds)].sort();
  const key = normalizedIds.join('\u0000');
  const existing = aggregateBatchRequests.get(key);
  if (existing) return existing;
  const request = window.nakiros.listProjectAggregates(normalizedIds)
    .finally(() => aggregateBatchRequests.delete(key));
  aggregateBatchRequests.set(key, request);
  return request;
}

/** Only Claude-backed aggregate stores can currently be recomputed. */
export function supportsProjectAggregate(project: Project): boolean {
  return project.provider === 'claude' || project.provider === 'cowork';
}

/** Compare the persisted aggregate snapshot with the project's real activity. */
export function isProjectAggregateStale(
  project: Project,
  aggregate: ProjectAggregate | null | undefined,
): boolean {
  if (!supportsProjectAggregate(project)) return false;
  if (!aggregate) return true;
  const computedAt = Date.parse(aggregate.computedAt);
  if (Number.isNaN(computedAt)) return true;
  if (!project.lastActivityAt) return false;
  const lastActivityAt = Date.parse(project.lastActivityAt);
  return !Number.isNaN(lastActivityAt) && computedAt < lastActivityAt;
}

/**
 * Defer stale recomputes until the browser is idle. The module-level queue
 * survives StrictMode remounts and guarantees at most two daemon calls run at
 * once across every ProjectsTab instance.
 */
export function scheduleProjectAggregateRefreshes(projectIds: string[]): () => void {
  if (projectIds.length === 0) return () => undefined;
  const run = () => enqueueProjectAggregateRefreshes(projectIds);
  type IdleWindow = Omit<Window, 'requestIdleCallback' | 'cancelIdleCallback'> & {
    requestIdleCallback?: Window['requestIdleCallback'];
    cancelIdleCallback?: Window['cancelIdleCallback'];
  };
  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const id = idleWindow.requestIdleCallback(run, { timeout: 1_500 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }
  const id = globalThis.setTimeout(run, 120);
  return () => globalThis.clearTimeout(id);
}

function enqueueProjectAggregateRefreshes(projectIds: string[]): void {
  for (const projectId of projectIds) {
    if (queuedIds.has(projectId) || activeIds.has(projectId)) continue;
    queuedIds.add(projectId);
    pendingIds.push(projectId);
  }
  pumpRefreshQueue();
}

function pumpRefreshQueue(): void {
  while (activeCount < MAX_CONCURRENT_REFRESHES && pendingIds.length > 0) {
    const projectId = pendingIds.shift();
    if (!projectId) return;
    queuedIds.delete(projectId);
    activeIds.add(projectId);
    activeCount += 1;
    void window.nakiros.refreshProjectAggregate(projectId)
      .catch(() => undefined)
      .finally(() => {
        activeIds.delete(projectId);
        activeCount -= 1;
        pumpRefreshQueue();
      });
  }
}
