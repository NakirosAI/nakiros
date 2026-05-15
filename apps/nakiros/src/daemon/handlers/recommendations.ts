/**
 * `recommendations:*` IPC channels for the friction-pattern recommendation
 * feature.
 *
 * Channels registered:
 *   - `recommendations:listPatterns`   — list (or recompute) patterns for a project
 *   - `recommendations:getPattern`     — get a single pattern + its reco cards
 *   - `recommendations:refresh`        — force-recompute patterns from cached analyses
 *   - `recommendations:analyzePattern` — start a LLM analyser run for a pattern
 *   - `recommendations:stopAnalyze`    — cancel an in-flight analyser run
 *   - `recommendations:applyReco`      — spawn a downstream fix/edit/create run for a card
 *   - `recommendations:dismissReco`    — mark a card as dismissed (no run spawned)
 *   - `recommendations:editRecoBrief`  — update the brief text of a card in-place
 */

import type {
  ApplyRecoResponse,
  RecoCard,
  RecommendationAnalyzeRunEvent,
  RecommendationPattern,
  StartRecommendationAnalyzeRequest,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { peekCachedAnalysis } from '../../services/conversation-analysis-cache.js';
import { listSessionsForProject } from '../../services/conversation-ingest/project-store.js';
import { groupPatterns, wrapZone } from '../../services/recommendation-cluster.js';
import {
  listRecoCards,
  readPatterns,
  updatePatternAnalysis,
  updateRecoStatus,
  writeRecoBody,
  writePatterns,
} from '../../services/recommendation-store.js';
import {
  startRecommendationAnalyze,
  stopRecommendationAnalyze,
  getRecommendationAnalyzeRun,
  listActiveRecommendationAnalyzeRuns,
  getRecommendationAnalyzeBufferedEvents,
} from '../../services/recommendation-analyze-runner.js';
import { applyReco } from '../../services/recommendation-apply.js';
import { createEventBroadcaster, createTypedHandler, withBroadcastOnError } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// ─── Event broadcaster ────────────────────────────────────────────────────────

const broadcastAnalyzeEvent = createEventBroadcaster<RecommendationAnalyzeRunEvent>(
  'recommendations:event',
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the project record or throw a contextual error. Used in every
 * handler that needs `projectPath` / `providerProjectDir`.
 */
function resolveProject(projectId: string): {
  projectPath: string;
  providerProjectDir: string;
} {
  const p = getProject(projectId);
  if (!p) throw new Error(`Project ${projectId} not found`);
  return { projectPath: p.projectPath, providerProjectDir: p.providerProjectDir };
}

/**
 * Recompute {@link RecommendationPattern}s for a project from the cached
 * conversation analyses stored on disk. Cheap — no LLM involved. Idempotent
 * and atomic (writes a single `patterns.json` at the end).
 *
 * @param projectId  The project to recompute patterns for.
 * @returns          The freshly computed pattern array.
 */
function recomputePatterns(projectId: string): RecommendationPattern[] {
  const { projectPath, providerProjectDir } = resolveProject(projectId);
  const sessions = listSessionsForProject(projectPath);

  const wrapped = [];
  for (const session of sessions) {
    const analysis = peekCachedAnalysis(providerProjectDir, session.sessionId);
    if (!analysis?.frictionZones?.length) continue;
    for (const zone of analysis.frictionZones) {
      wrapped.push(wrapZone({ convoId: session.sessionId, zoneId: zone.id }, zone));
    }
  }

  const patterns = groupPatterns(projectId, wrapped);
  writePatterns(projectId, patterns);
  return patterns;
}

// ─── Handler registry ─────────────────────────────────────────────────────────

/**
 * Domain handler bundle for all `recommendations:*` IPC channels.
 * Register via `...recommendationsHandlers` in `buildHandlerRegistry()`.
 */
export const recommendationsHandlers: HandlerRegistry = {
  /**
   * Return stored patterns for the project, or recompute them on the fly if
   * no patterns file exists yet. The recomputation is cheap (no LLM) so it is
   * safe to do inline.
   */
  'recommendations:listPatterns': createTypedHandler(
    (projectId: string): RecommendationPattern[] => {
      return readPatterns(projectId) ?? recomputePatterns(projectId);
    },
  ),

  /**
   * Return a single pattern by id together with all its reco cards. The
   * `pattern` field is `null` when the id is not found (e.g. stale frontend
   * cache). The `recos` array may be empty when the LLM analyser has not run
   * yet.
   */
  'recommendations:getPattern': createTypedHandler(
    (
      projectId: string,
      patternId: string,
    ): { pattern: RecommendationPattern | null; recos: RecoCard[] } => {
      const patterns = readPatterns(projectId) ?? [];
      const pattern = patterns.find((p) => p.id === patternId) ?? null;
      const recos = listRecoCards(projectId, patternId);
      return { pattern, recos };
    },
  ),

  /**
   * Force-recompute patterns from cached analyses and return the updated list.
   * Called by the frontend when the user explicitly asks for a refresh (e.g.
   * after new conversations have been ingested).
   */
  'recommendations:refresh': createTypedHandler(
    (projectId: string): { patternCount: number } => {
      const patterns = recomputePatterns(projectId);
      return { patternCount: patterns.length };
    },
  ),

  /**
   * Start (or rebind to an active) LLM analyser run for the given pattern.
   * Flips `analysis.status` to `'running'` synchronously before the runner
   * spawns the subprocess so the frontend sees the status change immediately
   * after the IPC call returns — no need to wait for the first stream event.
   * Returns the `runId`; progress arrives via `recommendations:event`.
   */
  'recommendations:analyzePattern': createTypedHandler(
    (request: StartRecommendationAnalyzeRequest): { runId: string } => {
      const { projectPath, providerProjectDir } = resolveProject(request.projectId);
      // Flip status synchronously so a pattern refresh right after the IPC
      // call already shows `running` in the UI.
      updatePatternAnalysis(request.projectId, request.patternId, {
        status: 'running',
        runId: undefined,
      });
      try {
        const run = startRecommendationAnalyze(request, {
          projectPath,
          providerProjectDir,
          onEvent: broadcastAnalyzeEvent,
        });
        // Persist the real runId once the runner entry is created.
        updatePatternAnalysis(request.projectId, request.patternId, {
          status: 'running',
          runId: run.runId,
        });
        return { runId: run.runId };
      } catch (err) {
        updatePatternAnalysis(request.projectId, request.patternId, { status: 'failed' });
        throw err;
      }
    },
  ),

  /**
   * Cancel an in-flight analyser run. No-op when the run is already in a
   * terminal state or unknown.
   */
  'recommendations:stopAnalyze': createTypedHandler(
    withBroadcastOnError(
      'recommendations:event',
      (runId: string): void => {
        stopRecommendationAnalyze(runId);
      },
      (runId) => runId,
    ),
  ),

  /**
   * Look up a recommendation analyser run by id. Returns `null` when unknown.
   */
  'recommendations:getAnalyzeRun': createTypedHandler(getRecommendationAnalyzeRun),

  /**
   * List all active (non-terminal) recommendation analyser runs across all projects.
   */
  'recommendations:listActiveAnalyzeRuns': createTypedHandler(listActiveRecommendationAnalyzeRuns),

  /**
   * Return the buffered replay events for the given run. Used by frontend
   * components that mount after the run has already started.
   */
  'recommendations:getAnalyzeBufferedEvents': createTypedHandler(getRecommendationAnalyzeBufferedEvents),

  /**
   * Spawn a downstream fix / edit / create run for the given reco card and
   * send the card's brief as the first user message. Returns the downstream
   * `runId` and `runKind` so the frontend can navigate to the correct run
   * screen. Idempotent — returns the prior `runId` when the card is already
   * `'applied'`.
   */
  'recommendations:applyReco': createTypedHandler(
    async (
      projectId: string,
      patternId: string,
      recId: string,
      editedBrief?: string,
    ): Promise<ApplyRecoResponse> => {
      const { projectPath } = resolveProject(projectId);
      return applyReco(projectId, patternId, recId, {
        projectPath,
        editedBrief,
        onEvent: () => undefined,
      });
    },
  ),

  /**
   * Mark a reco card as `'dismissed'` without spawning any run. Idempotent.
   */
  'recommendations:dismissReco': createTypedHandler(
    (
      projectId: string,
      patternId: string,
      recId: string,
    ): { ok: boolean } => {
      updateRecoStatus(projectId, patternId, recId, { status: 'dismissed' });
      return { ok: true };
    },
  ),

  /**
   * Replace the "## Brief" section body of a card with `brief`. The change is
   * persisted to disk immediately so subsequent `applyReco` calls see the
   * updated text. Returns `{ ok: false }` when the card is not found.
   */
  'recommendations:editRecoBrief': createTypedHandler(
    (
      projectId: string,
      patternId: string,
      recId: string,
      brief: string,
    ): { ok: boolean } => {
      const cards = listRecoCards(projectId, patternId);
      const card = cards.find((c) => c.recId === recId);
      if (!card) return { ok: false };
      const newBody = card.body.replace(
        /(## Brief\s*\n)([\s\S]*?)(\n## )/,
        `$1${brief}\n$3`,
      );
      writeRecoBody(projectId, patternId, recId, newBody);
      return { ok: true };
    },
  ),
};

// ─── Re-export for daemon boot ────────────────────────────────────────────────

/**
 * Boot-time buffered-events getter — used by `server.ts` to replay events for
 * reconnecting frontend tabs. Exported here so `server.ts` can import from a
 * single handlers module rather than reaching into the runner directly.
 */
export { getRecommendationAnalyzeBufferedEvents };
